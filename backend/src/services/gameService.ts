import { AppError, ErrorCode } from "../types";
import type { Game, GameSessionSnapshot, RoleDistributionMode } from "../types/entities/game";
import { GameModel, GameModelTransaction } from "../repositories/gameRepository";
import { ParticipantModel, ParticipantModelTransaction } from "../repositories/participantRepository";
import { ActionModelTransaction } from "../repositories/actionRepository";
import type { Participant } from "../types/entities/participant";
import type { PlayerAction } from "../types/websocket/types";
import type { PhaseType } from "../types/entities/game";
import gameLobbyService from "./gameLobbyService";
import prisma from "../../prisma/client";
import { PlayerModel } from "../repositories/playerRepository";
import { BotModel } from "../repositories/botRepository";
import { Role, RoleAlignment } from "../types/entities/role";

class GameService {
	async createGame(): Promise<Game> {
		for (let attempt = 0; attempt < 5; attempt++) {
			const gameCode = this.generateGameCode();

			try {
				return await GameModel.create({ gameCode });
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") continue;
				throw err;
			}
		}

		throw new AppError(ErrorCode.GAME_NOT_CREATED);
	}

	async findByGameId(gameId: number): Promise<Game | null> {
		return GameModel.findByGameId(gameId);
	}

	async findByGameCode(gameCode: string): Promise<Game | null> {
		return GameModel.findByGameCode(gameCode.trim());
	}

	async findByGameIdAndPlayerId(gameId: number, playerId: number): Promise<Participant | null> {
		return ParticipantModel.findByGameIdAndPlayerId(gameId, playerId);
	}

	async latestActiveGameForPlayer(playerId: number): Promise<Game | null> {
		return GameModel.findActiveGameByPlayerId(playerId);
	}

	async getLobbyGameSnapshot(gameId: number): Promise<GameSessionSnapshot | null> {
		const snapshot = await GameModel.findSessionSnapshot(gameId);
		if (!snapshot || (snapshot.game.status !== "lobby" && snapshot.game.status !== "starting")) {
			return null;
		}

		return snapshot;
	}

	async getInProgressGameSnapshot(gameId: number): Promise<GameSessionSnapshot | null> {
		const snapshot = await GameModel.findSessionSnapshot(gameId);
		if (!snapshot || snapshot.game.status !== "in_progress") {
			return null;
		}

		return snapshot;
	}

	async joinGame(playerId: number, gameId: number): Promise<Participant> {
		const game = await GameModel.findByGameId(gameId);
		if (!game) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		if (game.status !== "lobby") {
			throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
		}

		const existing = await ParticipantModel.findByGameIdAndPlayerId(gameId, playerId);
		if (existing) {
			return existing;
		}

		return gameLobbyService.claimSeat(gameId, playerId);
	}
	
	async leaveGame(playerId: number, gameId: number): Promise<void> {
		return await prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantModel = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			await participantModel.delete(gameId, playerId);
		});
	}

	async kickPlayer(kickerId: number, playerId: number, gameId: number): Promise<void> {
		return await prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantModel = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const kickerParticipant = await participantModel.findByGameIdAndPlayerId(gameId, kickerId);
			if (!kickerParticipant || kickerParticipant.seatNr !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			const targetParticipant = await participantModel.findByGameIdAndPlayerId(gameId, playerId);
			if (!targetParticipant) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			await participantModel.delete(gameId, playerId);
		});
	}

	async addBot(leaderId: number, gameId: number): Promise<Participant> {
		const game = await GameModel.findByGameId(gameId);
		if (!game) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		if (game.status !== "lobby") {
			throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
		}

		const leaderParticipant = await ParticipantModel.findByGameIdAndPlayerId(gameId, leaderId);
		if (!leaderParticipant || leaderParticipant.seatNr !== 1) {
			throw new AppError(ErrorCode.NOT_GAME_LEADER);
		}

		const existingParticipants = await ParticipantModel.findByGameId(gameId);
		const existingPlayerIds = existingParticipants.map((p) => p.playerId);

		const availableBots = await BotModel.getAvailableBots(existingPlayerIds);
		if (availableBots.length === 0) {
			throw new AppError(ErrorCode.BOT_NOT_ADDED);
		}

		const selectedBot = availableBots[Math.floor(Math.random() * availableBots.length)];
		if (!selectedBot) {
			throw new AppError(ErrorCode.BOT_NOT_ADDED);
		}

		const botPlayer = await PlayerModel.findByBotId(selectedBot.id);
		if (!botPlayer) {
			throw new AppError(ErrorCode.BOT_NOT_ADDED);
		}

		return gameLobbyService.claimSeat(gameId, botPlayer.id);
	}

	async startGame(gameId: number, minPlayers: number, roleSettings: Record<number, number>, roleDistributionMode: RoleDistributionMode, roles: Role[]): Promise<Participant[]> {
		return await prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantsModel = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}

			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const participantList = await participantsModel.findByGameId(gameId);
			if (participantList.length < minPlayers) {
				throw new AppError(ErrorCode.UNKNOWN_ERROR);
			}

			const rolePool = this.buildRolePool(roles, roleSettings, roleDistributionMode, participantList.length);
			if (rolePool.length !== participantList.length) {
				throw new AppError(ErrorCode.UNKNOWN_ERROR);
			}

			const shuffledParticipants = [...participantList];
			for (let i = shuffledParticipants.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const temp = shuffledParticipants[i];
				shuffledParticipants[i] = shuffledParticipants[j];
				shuffledParticipants[j] = temp;
			}

			const updatedParticipants: Participant[] = [];

			for (let i = 0; i < shuffledParticipants.length; i++) {
				const participant = shuffledParticipants[i];
				const roleId = rolePool[i];

				await participantsModel.patch({
					gameId: participant.gameId,
					playerId: participant.playerId,
					roleId
				});

				const updatedParticipant = await participantsModel.findByGameIdAndPlayerId(participant.gameId, participant.playerId);
				if (updatedParticipant) {
					updatedParticipants.push(updatedParticipant);
				}
			}

			await gamesModel.changeStatus(gameId, "in_progress");

			return updatedParticipants;
		});
	}

	async completeGame(gameId: number, winnerAlignment: RoleAlignment, winnerPlayerIds: number[]): Promise<void> {
		await prisma.$transaction(async (tx) => {
			const gameModel = GameModelTransaction(tx);
			const participantModel = ParticipantModelTransaction(tx);

			await gameModel.completeGame(gameId, winnerAlignment);
			await participantModel.setWinnersByGameId(gameId, winnerPlayerIds);
		});
	}

	async cancelAllNonFinishedGames(): Promise<number> {
		return await GameModel.cancelAllNonFinishedGames();
	}

	async cancelGame(gameId: number): Promise<void> {
		await GameModel.changeStatus(gameId, "cancelled");
	}

	async savePhaseActions(gameId: number, phase: PhaseType, dayNumber: number, pendingActions: Map<number, PlayerAction>): Promise<void> {
		return await prisma.$transaction(async (tx) => {
			const actionModel = ActionModelTransaction(tx);
			const participantModel = ParticipantModelTransaction(tx);

			for (const [playerId, action] of pendingActions) {
				const actorParticipant = await participantModel.findByGameIdAndPlayerId(gameId, playerId);
				if (!actorParticipant) {
					continue;
				}

				let targetParticipantId: number | null = null;
				if (action.targetPlayerId !== null) {
					const targetParticipant = await participantModel.findByGameIdAndPlayerId(gameId, action.targetPlayerId);
					if (targetParticipant) {
						targetParticipantId = targetParticipant.playerId;
					}
				}

				await actionModel.create({ gameId, actorParticipantId: actorParticipant.playerId, targetParticipantId, actionKey: action.type, dayNumber, phase });
			}
		});
	}

	async setDead(gameId: number, deadPlayerIds: number[]): Promise<void> {
		await ParticipantModel.setDeadByGameId(gameId, deadPlayerIds);
	}

	private buildRolePool(roles: Role[], roleSettings: Record<number, number>, roleDistributionMode: RoleDistributionMode, participantCount: number): number[] {
		const rolePool: number[] = [];

		switch (roleDistributionMode) {
			case "exact": {
				for (const [roleId, count] of Object.entries(roleSettings)) {
					for (let i = 0; i < count; i++) {
						rolePool.push(Number(roleId));
					}
				}
				break;
			}
			case "weighted_random": {
				const enabledCommuneRoles: Role[] = [];
				const enabledNeutralRoles: Role[] = [];
				const enabledVampireRoles: Role[] = [];

				for (const role of roles) {
					if ((roleSettings[role.id] ?? 0) <= 0) {
						continue;
					}

					switch (role.alignment) {
						case "commune":
							enabledCommuneRoles.push(role);
							break;
						case "neutral":
							enabledNeutralRoles.push(role);
							break;
						case "vampire":
							enabledVampireRoles.push(role);
							break;
					}
				}

				// Calculate average weight per alignment
				const vampireAveragePower = this.getAverageRolePower(enabledVampireRoles);
				const communeAveragePower = this.getAverageRolePower(enabledCommuneRoles);

				// Determine how many neutral roles to include
				const maxNeutralCount = Math.floor(participantCount / 4);
				const neutralCount = enabledNeutralRoles.length > 0 ? Math.floor(Math.random() * (maxNeutralCount + 1)) : 0;

				// Add random neutral roles
				let neutralPower = 0;
				for (let i = 0; i < neutralCount; i++) {
					const pickedNeutral = enabledNeutralRoles[Math.floor(Math.random() * enabledNeutralRoles.length)];
					rolePool.push(pickedNeutral.id);
					neutralPower += pickedNeutral.weight;
				}

				// Remaining slots after neutrals are assigned
				const remainingSlots = participantCount - rolePool.length;

				// Limit how many vampires can exist
				const maxVampiresByAdvantage = Math.floor(participantCount / 3);
				// Must leave room for at least one commune
				const maxVampiresBySlots = remainingSlots - 1;
				// Always at least one vampire
				const minVampires = 1;
				// Final cap for vampire count
				const maxVampireSlots = Math.min(maxVampiresBySlots, maxVampiresByAdvantage);

				// Try to balance total power between factions
				const denominator = vampireAveragePower - communeAveragePower;
				let sweetspotVampireCount = remainingSlots / 2;
				if (Math.abs(denominator) > 0.0001) {
					sweetspotVampireCount = -(neutralPower + remainingSlots * communeAveragePower) / denominator;
				}

				// Clamp to allowed range
				let targetVampires = Math.round(sweetspotVampireCount);
				targetVampires = Math.max(minVampires, Math.min(maxVampireSlots, targetVampires));
				// Remaining players become commune
				const targetCommune = remainingSlots - targetVampires;

				// Fill commune roles randomly
				for (let i = 0; i < targetCommune; i++) {
					const pickedCommune = enabledCommuneRoles[Math.floor(Math.random() * enabledCommuneRoles.length)];
					rolePool.push(pickedCommune.id);
				}

				// Fill vampire roles randomly
				for (let i = 0; i < targetVampires; i++) {
					const pickedVampire = enabledVampireRoles[Math.floor(Math.random() * enabledVampireRoles.length)];
					rolePool.push(pickedVampire.id);
				}

				break;
			}
		}

		return rolePool;
	}

	private getAverageRolePower(roles: Role[]): number {
		if (roles.length === 0) {
			return 0;
		}

		let totalWeight = 0;
		for (const role of roles) {
			totalWeight += role.weight;
		}

		return totalWeight / roles.length;
	}

	private generateGameCode(): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		let code = "";

		for (let i = 0; i < 6; i++) {
			code += chars.charAt(Math.floor(Math.random() * chars.length));
		}

		return code;
	}
}

export default new GameService();
