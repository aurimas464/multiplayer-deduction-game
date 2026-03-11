import prisma from "../prisma";
import type { Prisma, Participant as ParticipantPrisma } from "@prisma/client";
import type { Participant } from "../types/entities/participant";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapParticipant(p: ParticipantPrisma): Participant {
		return {
			gameId: p.gameId,
			playerId: p.playerId,
			seatNr: p.seatNr,
			roleId: p.roleId,
		};
	}

	async findByGameId(gameId: number): Promise<Participant[]> {
		const rows = await this.db.participant.findMany({
			where: { gameId },
			orderBy: { seatNr: "asc" },
		});

		return rows.map((r) => this.mapParticipant(r));
	}

	async findByGameIdAndPlayerId(gameId: number, playerId: number): Promise<Participant | null> {
		const row = await this.db.participant.findUnique({
			where: {
				gameId_playerId: {
					gameId,
					playerId,
				},
			},
		});

		return row ? this.mapParticipant(row) : null;
	}

	async countByGameId(gameId: number): Promise<number> {
		return this.db.participant.count({
			where: { gameId },
		});
	}

	async create(gameId: number, playerId: number, seatNr: number): Promise<Participant> {
		const row = await this.db.participant.create({
			data: { gameId, playerId, seatNr },
		});

		return this.mapParticipant(row);
	}

	async listOccupiedSeats(gameId: number): Promise<number[]> {
		const rows = await this.db.participant.findMany({
			where: { gameId },
			select: { seatNr: true },
			orderBy: { seatNr: "asc" },
		});

		return rows.map((r) => r.seatNr);
	}

	async updateSeat(gameId: number, playerId: number, seatNr: number): Promise<void> {
		await this.db.participant.update({
			where: {
				gameId_playerId: {
					gameId,
					playerId,
				},
			},
			data: { seatNr },
		});
	}
}

export const ParticipantModel = new Model(prisma);
export const ParticipantModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);