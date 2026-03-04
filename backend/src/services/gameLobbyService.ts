import { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../models/game";
import { SeatModelTransaction } from "../models/seat";
import { Seat } from "../types/entities/seat";
import prisma from "../prisma";
import { Game } from "../types/entities/game";

const MAX_LOBBY_SIZE = 20;
const MIN_LOBBY_SIZE = 5;

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

	public async changeLobbySize(playerId: number, gameCode: string, maxPlayers: number): Promise<Game> {
		const code = gameCode.trim();

		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);

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

			const inLobby = await tx.seat.findFirst({
				where: { gameId: locked.id, playerId },
				select: { playerId: true },
			});
			if (!inLobby) {
				throw new AppError(ErrorCode.NOT_IN_LOBBY);
			}

			if (maxPlayers < MIN_LOBBY_SIZE || maxPlayers > MAX_LOBBY_SIZE) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			const violating = await tx.seat.count({
				where: { gameId: locked.id, number: { gt: maxPlayers } },
			});
			if (violating > 0) {
				throw new AppError(ErrorCode.LOBBY_TOO_SMALL);
			}

			return gamesModel.updateMaxPlayers(locked.id, maxPlayers);
		});
	}
}

export default new GameLobbyService();