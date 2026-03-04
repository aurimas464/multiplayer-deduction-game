import prisma from "../prisma";
import type { Prisma } from "@prisma/client";
import type { Seat } from "../types/entities/seat";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapSeat(p: Seat): Seat {
		return {
			gameId: p.gameId,
			playerId: p.playerId,
			number: p.number,
		};
	}

	async findByGameId(gameId: number): Promise<Seat[]> {
		const rows = await this.db.seat.findMany({
			where: { gameId },
		});

		return rows.map((r) => this.mapSeat(r));
	}

	async findByGameCodeAndPlayerId(gameCode: string, playerId: number): Promise<Seat | null> {
		const game = await this.db.game.findUnique({
			where: { gameCode },
			select: { id: true },
		});

		if (!game) return null;

		const row = await this.db.seat.findUnique({
			where: {
				gameId_playerId: {
					gameId: game.id,
					playerId,
				},
			},
		});

		return row ? this.mapSeat(row) : null;
	}

	async countByGameId(gameId: number): Promise<number> {
		return this.db.seat.count({ where: { gameId } });
	}

	async listOccupied(gameId: number): Promise<number[]> {
		const rows = await this.db.seat.findMany({
			where: { gameId },
			select: { number: true },
			orderBy: { number: "asc" },
		});

		return rows.map((r) => r.number);
	}

	async create(gameId: number, playerId: number, number: number): Promise<Seat> {
		const row = await this.db.seat.create({
			data: { gameId, playerId, number },
		});

		return this.mapSeat(row);
	}

	async updateNumber(gameId: number, playerId: number, number: number): Promise<void> {
		await this.db.seat.update({
			where: {
				gameId_playerId: { gameId, playerId },
			},
			data: { number },
		});
	}
}

export const SeatModel = new Model(prisma);
export const SeatModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);