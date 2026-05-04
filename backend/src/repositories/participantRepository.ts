import prisma from "../../prisma/client";
import type { Prisma, Participant as ParticipantPrisma } from "@prisma/client";
import type { Participant, CreateParticipant, PatchParticipant } from "../types/entities/participant";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapParticipant(participant: ParticipantPrisma): Participant {
		return {
			gameId: participant.gameId,
			playerId: participant.playerId,
			roleId: participant.roleId,
			seatNr: participant.seatNr,
			didWin: participant.didWin,
			isAlive: participant.isAlive,
			createdAt: participant.createdAt,
			updatedAt: participant.updatedAt
		};
	}

	async create(data: CreateParticipant): Promise<Participant> {
		const row = await this.db.participant.create({ data });

		return this.mapParticipant(row);
	}
	
	async findByPlayerId(playerId: number): Promise<Participant[]> {
		const rows = await this.db.participant.findMany({
			where: { playerId }
		});

		return rows.map((row) => this.mapParticipant(row));
	}

	async findByGameId(gameId: number): Promise<Participant[]> {
		const rows = await this.db.participant.findMany({
			where: { gameId },
			orderBy: { seatNr: "asc" }
		});

		return rows.map((row) => this.mapParticipant(row));
	}

	async findByGameIdAndPlayerId(gameId: number, playerId: number): Promise<Participant | null> {
		const row = await this.db.participant.findUnique({
			where: {
				gameId_playerId: {
					gameId,
					playerId
				}
			}
		});

		return row ? this.mapParticipant(row) : null;
	}

	async findOccupiedSeats(gameId: number): Promise<number[]> {
		const rows = await this.db.participant.findMany({
			where: { gameId },
			select: { seatNr: true },
			orderBy: { seatNr: "asc" }
		});

		return rows.map((row) => row.seatNr);
	}

	async countByGameId(gameId: number): Promise<number> {
		return this.db.participant.count({
			where: { gameId }
		});
	}

	async setWinnersByGameId(gameId: number, winnerPlayerIds: number[]): Promise<void> {
		if (winnerPlayerIds.length === 0) {
			return;
		}

		await this.db.participant.updateMany({
			where: {
				gameId,
				playerId: { in: winnerPlayerIds }
			},
			data: { didWin: true }
		});
	}

	async setDeadByGameId(gameId: number, deadPlayerIds: number[]): Promise<void> {
		if (deadPlayerIds.length === 0) {
			return;
		}

		await this.db.participant.updateMany({
			where: {
				gameId,
				playerId: { in: deadPlayerIds }
			},
			data: { isAlive: false }
		});
	}

	async patch(patch: PatchParticipant): Promise<void> {
		const data: Prisma.ParticipantUncheckedUpdateInput = {};

		if (patch.seatNr !== undefined) data.seatNr = patch.seatNr;
		if (patch.roleId !== undefined) data.roleId = patch.roleId;

		if (Object.keys(data).length === 0) return;

		await this.db.participant.update({
			where: {
				gameId_playerId: {
					gameId: patch.gameId,
					playerId: patch.playerId
				}
			},
			data
		});
	}

	async delete(gameId: number, playerId: number): Promise<void> {
		await this.db.participant.deleteMany({
			where: {
				gameId,
				playerId
			}
		});
	}
}

export const ParticipantModel = new Model(prisma);
export const ParticipantModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
