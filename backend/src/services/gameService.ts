import prisma from "../prisma";
import type { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "../types";
import type { Game, GameWithSeats } from "../types/entities/game";
import { GameModel, GameModelTransaction } from "../models/game";
import { SeatModel, SeatModelTransaction } from "../models/seat";
import type { Seat } from "../types/entities/seat";
import gameLobbyService from "./gameLobbyService";

class GameService {
	public async createGame(): Promise<Game> {
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

	public async getLobbyMeta(gameCode: string): Promise<GameWithSeats | null> {
		return GameModel.findGameWithSeats(gameCode);
	}

	public async existsByCode(gameCode: string): Promise<boolean> {
		return GameModel.existsByCode(gameCode);
	}

	public async findByGameCodeAndPlayerId(gameCode: string, playerId: number): Promise<Seat | null> {
		return SeatModel.findByGameCodeAndPlayerId(gameCode, playerId);
	}

	public async latestActiveGameForPlayer(playerId: number): Promise<Game | null> {
		return GameModel.findActiveGameByPlayerId(playerId);
	}

	public async joinGame(playerId: number, gameCode: string): Promise<Seat> {
		const code = gameCode.trim();

		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const seatsModel = SeatModelTransaction(tx);

			const lobby = await gamesModel.findGameWithSeats(code);
			if (!lobby) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}

			const locked = await gamesModel.lockGameForSeatMutation(lobby.id);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			const current = await gamesModel.findActiveGameByPlayerId(playerId);
			if (current?.gameCode && current.gameCode !== code) {
				throw new AppError(ErrorCode.ALREADY_IN_GAME);
			}

			const rows = await seatsModel.findByGameId(locked.id);
			const mine = rows.find((s) => s.playerId === playerId);
			if (mine) return mine;

			const occupiedNumbers = rows.map((s) => s.number);

			return gameLobbyService.claimSeat(tx, locked.id, playerId, locked.maxPlayers, occupiedNumbers);
		});
	}

	public async leaveGame(playerId: number, gameCode: string): Promise<void> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			await gamesModel.removePlayerFromGame(gameCode.trim(), playerId);
		});
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