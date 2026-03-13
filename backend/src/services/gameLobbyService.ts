import { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../models/game";
import { ParticipantModelTransaction } from "../models/participant";
import type { Participant } from "../types/entities/participant";
import prisma from "../../prisma/client";
import type { MetaSettings } from "../types/websocket";

const MAX_LOBBY_SIZE = 20;
const MIN_LOBBY_SIZE = 5;
const MIN_PERIOD_SECONDS = 10;
const MAX_PERIOD_SECONDS = 999;

class GameLobbyService {
	async claimSeat(gameId: number, playerId: number): Promise<Participant> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participants = ParticipantModelTransaction(tx);

			const locked = await gamesModel.lockGameForSeatMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			const existing = await participants.findByGameIdAndPlayerId(gameId, playerId);
			if (existing) {
				return existing;
			}

			const count = await participants.countByGameId(gameId);
			if (count >= locked.maxPlayers) {
				throw new AppError(ErrorCode.GAME_FULL);
			}

			const occupied = new Set(await participants.listOccupiedSeats(gameId));
			for (let seatNr = 1; seatNr <= locked.maxPlayers; seatNr++) {
				if (occupied.has(seatNr)) continue;

				try {
					return await participants.create(gameId, playerId, seatNr);
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

			const locked = await gamesModel.lockGameForSeatMutation(gameId);
			if (!locked) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (locked.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			if (newSeatNr < 1 || newSeatNr > locked.maxPlayers) {
				throw new AppError(ErrorCode.INVALID_SEAT);
			}

			const participants = await participantsModel.findByGameId(locked.id);

			const me = participants.find((p) => p.playerId === playerId);
			if (!me) {
				throw new AppError(ErrorCode.NOT_IN_LOBBY);
			}

			if (me.seatNr === newSeatNr) return;

			const occupiedByOther = participants.some((p) => p.seatNr === newSeatNr && p.playerId !== playerId);
			if (occupiedByOther) {
				throw new AppError(ErrorCode.SEAT_TAKEN);
			}

			try {
				await participantsModel.updateSeat(locked.id, playerId, newSeatNr);
			} catch (err: unknown) {
				const e = err as { code?: string };
				if (e?.code === "P2002") {
					throw new AppError(ErrorCode.SEAT_TAKEN);
				}
				throw err;
			}
		});
	}

	async updateLobbySettings(playerId: number, gameId: number, metaSettings: Partial<MetaSettings>): Promise<boolean> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);

            const lobby = await gamesModel.findGameWithParticipants(gameId);
            if (!lobby) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (lobby.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			const myParticipant = lobby.participants.find((p) => p.playerId === playerId);

			if (!myParticipant || myParticipant.seatNr !== 1) {
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

				const participantsModel = ParticipantModelTransaction(tx);
				const occupied = await participantsModel.listOccupiedSeats(locked.id);

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