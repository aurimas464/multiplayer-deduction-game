import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../repositories/gameRepository";
import { GameBotSetupModelTransaction } from "../repositories/gameBotSetupRepository";
import { ParticipantModelTransaction } from "../repositories/participantRepository";
import type { Participant } from "../types/entities/participant";
import type { BotDifficulty, BotPlaystyle } from "../types/entities/gameBotSetup";
import prisma from "../../prisma/client";
import type { MetaSettings } from "../types/websocket/types";

const MAX_LOBBY_SIZE = 20;
const MIN_LOBBY_SIZE = 5;
const MIN_PERIOD_SECONDS = 10;
const MAX_PERIOD_SECONDS = 999;

class GameLobbyService {
	async claimSeat(gameId: number, playerId: number): Promise<Participant> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participants = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const existing = await participants.findByGameIdAndPlayerId(gameId, playerId);
			if (existing) {
				return existing;
			}

			const count = await participants.countByGameId(gameId);
			if (count >= locked.maxPlayers) {
				throw new AppError(ErrorCode.GAME_FULL);
			}

			const occupied = new Set(await participants.findOccupiedSeats(gameId));
			for (let seatNr = 1; seatNr <= locked.maxPlayers; seatNr++) {
				if (occupied.has(seatNr)) continue;

				try {
					return await participants.create({ gameId, playerId, seatNr });
				} catch (err: unknown) {
					const e = err as { code?: string };
					if (e?.code === "P2002") {
						occupied.add(seatNr);
						continue;
					}
					throw err;
				}
			}

			throw new AppError(ErrorCode.GAME_FULL);
		});
	}

	async changeSeat(playerId: number, gameId: number, newSeatNr: number): Promise<void> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantsModel = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			if (newSeatNr < 1 || newSeatNr > locked.maxPlayers) {
				throw new AppError(ErrorCode.INVALID_SEAT);
			}

			const participants = await participantsModel.findByGameId(locked.id);

			const me = participants.find((p) => p.playerId === playerId);
			if (!me) {
				throw new AppError(ErrorCode.PLAYER_NOT_IN_LOBBY);
			}

			if (me.seatNr === newSeatNr) return;

			const occupiedByOther = participants.some((p) => p.seatNr === newSeatNr && p.playerId !== playerId);
			if (occupiedByOther) {
				throw new AppError(ErrorCode.SEAT_TAKEN);
			}

			try {
				await participantsModel.patch({gameId: locked.id, playerId, seatNr: newSeatNr});
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") {
					throw new AppError(ErrorCode.SEAT_TAKEN);
				}
				throw err;
			}
		});
	}

	async updateLobbySettings(playerId: number, gameId: number, metaSettings: Partial<MetaSettings>): Promise<void> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantsModel = ParticipantModelTransaction(tx);

            const game = await gamesModel.findByGameId(gameId);
            if (!game) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (game.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const existingParticipants = await participantsModel.findByGameId(gameId);
			const myParticipant = existingParticipants.find((p) => p.playerId === playerId);

			if (!myParticipant || myParticipant.seatNr !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			if (metaSettings.maxPlayers !== undefined && (metaSettings.maxPlayers < MIN_LOBBY_SIZE || metaSettings.maxPlayers > MAX_LOBBY_SIZE)) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.minPlayers !== undefined && (metaSettings.minPlayers < MIN_LOBBY_SIZE || metaSettings.minPlayers > (metaSettings.maxPlayers ?? game.maxPlayers))) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.daySeconds !== undefined && (metaSettings.daySeconds < MIN_PERIOD_SECONDS || metaSettings.daySeconds > MAX_PERIOD_SECONDS)) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.votingSeconds !== undefined && (metaSettings.votingSeconds < MIN_PERIOD_SECONDS || metaSettings.votingSeconds > MAX_PERIOD_SECONDS)) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.nightSeconds !== undefined && (metaSettings.nightSeconds < MIN_PERIOD_SECONDS || metaSettings.nightSeconds > MAX_PERIOD_SECONDS)) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.maxPlayers !== undefined) {
				const locked = await gamesModel.lockGameForMutation(gameId);
				if (!locked) {
					throw new AppError(ErrorCode.GAME_NOT_FOUND);
				}
				if (locked.status !== "lobby") {
					throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
				}

				const participantsModel = ParticipantModelTransaction(tx);
				const occupied = await participantsModel.findOccupiedSeats(locked.id);

				for (const number of occupied) {
					if (number > metaSettings.maxPlayers) {
						throw new AppError(ErrorCode.LOBBY_TOO_SMALL);
					}
				}
			}

			await gamesModel.patch({id: gameId, ...metaSettings});
		});
	}

	async updateBotSettings(playerId: number, gameId: number, botPlayerId: number, difficulty: BotDifficulty, playstyle: BotPlaystyle): Promise<void> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantsModel = ParticipantModelTransaction(tx);
			const gameBotSetupModel = GameBotSetupModelTransaction(tx);

			const locked = await gamesModel.lockGameForMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const requester = await participantsModel.findByGameIdAndPlayerId(gameId, playerId);
			if (!requester || requester.seatNr !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			const botParticipant = await participantsModel.findByGameIdAndPlayerId(gameId, botPlayerId);
			if (!botParticipant) {
				throw new AppError(ErrorCode.PLAYER_NOT_IN_LOBBY);
			}

			await gameBotSetupModel.upsert({ gameId, playerId: botPlayerId });
			await gameBotSetupModel.patch({ gameId, playerId: botPlayerId, difficulty, playstyle });
		});
	}
}

export default new GameLobbyService();