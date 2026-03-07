import { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../models/game";
import { SeatModelTransaction } from "../models/seat";
import { Seat } from "../types/entities/seat";
import prisma from "../prisma";	
import { MetaSettings } from "../types/websocket";

const MAX_LOBBY_SIZE = 20;
const MIN_LOBBY_SIZE = 5;
const MIN_PERIOD_SECONDS = 10;
const MAX_PERIOD_SECONDS = 999;

class GameLobbyService {

	public async claimSeat(tx: Prisma.TransactionClient, gameId: number, playerId: number, maxPlayers: number, occupiedNumbersFromDb?: number[]): Promise<Seat> {
		const seats = SeatModelTransaction(tx);

		const count = await seats.countByGameId(gameId);
		if (count >= maxPlayers) {
			throw new AppError(ErrorCode.GAME_FULL);
		}

		const occupied = new Set<number>(occupiedNumbersFromDb ?? []);
		if (!occupiedNumbersFromDb) {
			for (const n of await seats.listOccupied(gameId)) {
				occupied.add(n);
			}
		}

		for (let number = 1; number <= maxPlayers; number++) {
			if (occupied.has(number)) continue;

			try {
				return await seats.create(gameId, playerId, number);
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") {
					occupied.add(number);
					continue;
				}
				throw err;
			}
		}

		throw new AppError(ErrorCode.GAME_FULL);
	}

	public async changeSeat(playerId: number, gameCode: string, newNumber: number): Promise<void> {
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

			if (newNumber < 1 || newNumber > locked.maxPlayers) {
				throw new AppError(ErrorCode.INVALID_SEAT);
			}

			const seats = await seatsModel.findByGameId(locked.id);

			const me = seats.find((s) => s.playerId === playerId);
			if (!me) {
				throw new AppError(ErrorCode.NOT_IN_LOBBY);
			}

			if (me.number === newNumber) return;

			const occupiedByOther = seats.some((s) => s.number === newNumber && s.playerId !== playerId);
			if (occupiedByOther) {
				throw new AppError(ErrorCode.SEAT_TAKEN);
			}

			try {
				await seatsModel.updateNumber(locked.id, playerId, newNumber);
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") {
					throw new AppError(ErrorCode.SEAT_TAKEN);
				}
				throw err;
			}
		});
	}

	public async updateLobbySettings(playerId: number, gameCode: string, metaSettings: Partial<MetaSettings>): Promise<boolean> {
		const code = gameCode.trim();

		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);

			const lobby = await gamesModel.findGameWithSeats(code);
			if (!lobby) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (lobby.gameCode !== code) {
				throw new AppError(ErrorCode.NOT_IN_LOBBY);
			}
			if (lobby.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			const mySeat = lobby.seats.find((s) => s.playerId === playerId);
			if (!mySeat || mySeat.number !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			if (metaSettings.maxPlayers !== undefined && (metaSettings.maxPlayers < MIN_LOBBY_SIZE || metaSettings.maxPlayers > MAX_LOBBY_SIZE)) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			if (metaSettings.minPlayers !== undefined && (metaSettings.minPlayers < MIN_LOBBY_SIZE || metaSettings.minPlayers > (metaSettings.maxPlayers ?? lobby.maxPlayers))) {
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
				const locked = await gamesModel.lockGameForSeatMutation(lobby.id);
				if (!locked) {
					throw new AppError(ErrorCode.GAME_NOT_FOUND);
				}
				if (locked.status !== "lobby") {
					throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
				}

				const seatsModel = SeatModelTransaction(tx);
				const occupied = await seatsModel.listOccupied(locked.id);

				for (const number of occupied) {
					if (number > metaSettings.maxPlayers) {
						throw new AppError(ErrorCode.LOBBY_TOO_SMALL);
					}
				}
			}

			return gamesModel.update(lobby.id, metaSettings);
		});
	}
}

export default new GameLobbyService();