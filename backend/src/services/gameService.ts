import { AppError, ErrorCode } from "../types";
import type { Game, GameWithParticipants } from "../types/entities/game";
import { GameModel } from "../models/game";
import { ParticipantModel } from "../models/participant";
import type { Participant } from "../types/entities/participant";
import gameLobbyService from "./gameLobbyService";

class GameService {
	async createGame(): Promise<Game> {
		for (let attempt = 0; attempt < 5; attempt++) {
			const gameCode = this.generateGameCode();

			try {
				return await GameModel.create(gameCode);
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") continue;
				throw err;
			}
		}
		throw new AppError(ErrorCode.GAME_NOT_CREATED);
	}

	async getLobbyMeta(gameId: number): Promise<GameWithParticipants | null> {
		return GameModel.findGameWithParticipants(gameId);
	}

	async findByGameIdAndPlayerId(gameId: number, playerId: number): Promise<Participant | null> {
		return ParticipantModel.findByGameIdAndPlayerId(gameId, playerId);
	}

	async latestActiveGameForPlayer(playerId: number): Promise<Game | null> {
		return GameModel.findActiveGameByPlayerId(playerId);
	}

	async joinGame(playerId: number, gameCode: string): Promise<Participant> {
		const code = gameCode.trim();

		const game = await GameModel.findByGameCode(code);
		if (!game) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		if (game.status !== "lobby") {
			throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
		}

		const existing = await ParticipantModel.findByGameIdAndPlayerId(game.id, playerId);
		if (existing) {
			return existing;
		}

		return gameLobbyService.claimSeat(game.id, playerId);
	}

	async leaveGame(playerId: number, gameId: number): Promise<void> {
		await GameModel.removePlayerFromGame(gameId, playerId);
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