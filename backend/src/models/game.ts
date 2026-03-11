import prisma from "../prisma";
import type { Prisma, Game as GamePrisma } from "@prisma/client";
import type { Game, GameWithParticipants } from "../types/entities/game";
import { gameSchema, gameWithParticipantsSchema, GameStatus } from "../types/entities/game";
import type { MetaSettings } from "../types/websocket";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGame(p: GamePrisma): Game {
		return gameSchema.parse({
			id: p.id,
			gameCode: p.gameCode,
			status: p.status,
			maxPlayers: p.maxPlayers,
			minPlayers: p.minPlayers,
			phaseType: p.phaseType,
			daySeconds: p.daySeconds,
			votingSeconds: p.votingSeconds,
			nightSeconds: p.nightSeconds,
			tieBehavior: p.tieBehavior,
			voteCountVisibility: p.voteCountVisibility,
			anonymousVoting: p.anonymousVoting,
			roleRevealOnDeath: p.roleRevealOnDeath,
			roleDistributionMode: p.roleDistributionMode,
			createdAt: p.createdAt,
			updatedAt: p.updatedAt,
		});
	}

	async lockGameForSeatMutation(gameId: number): Promise<{ id: number; status: typeof GameStatus[number]; maxPlayers: number; gameCode: string } | null> {
		const rows = await this.db.$queryRaw<{ id: number; status: typeof GameStatus[number]; maxPlayers: number; gameCode: string }[]>`
			SELECT id, status, maxPlayers, gameCode
			FROM Game
			WHERE id = ${gameId}
			FOR UPDATE`;
		
		return rows[0] ?? null;
	}

	async findByGameCode(gameCode: string): Promise<Game | null> {
		const row = await this.db.game.findUnique({ where: { gameCode } });

		return row ? this.mapGame(row) : null;
	}

	async create(gameCode: string): Promise<Game> {
		const row = await this.db.game.create({
			data: {
				gameCode,
				status: "lobby",
			},
		});

		return this.mapGame(row);
	}

	async findActiveGameByPlayerId(playerId: number): Promise<Game | null> {
		const row = await this.db.game.findFirst({
			where: {
				status: { in: ["lobby", "in_progress"] },
				participants: { some: { playerId } },
			},
			orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
		});

		return row ? this.mapGame(row) : null;
	}

	async findGameWithParticipants(gameId: number): Promise<GameWithParticipants | null> {
		const row = await this.db.game.findFirst({
			where: { id: gameId },
			include: {
				participants: {
					orderBy: { seatNr: "asc" },
				},
			},
		});

		return row ? gameWithParticipantsSchema.parse(row) : null;
	}

	async removePlayerFromGame(gameId: number, playerId: number): Promise<void> {
		const target = await this.db.game.findUnique({
			where: { id: gameId },
			select: { id: true },
		});

		if (!target) return;

		await this.db.participant.deleteMany({
			where: {
				gameId: target.id,
				playerId,
			},
		});
	}

	async update(gameId: number, update: Partial<MetaSettings>): Promise<boolean> {
		const gameData: Record<string, unknown> = {};

		if (update.maxPlayers !== undefined) gameData.maxPlayers = update.maxPlayers;
		if (update.minPlayers !== undefined) gameData.minPlayers = update.minPlayers;
		if (update.daySeconds !== undefined) gameData.daySeconds = update.daySeconds;
		if (update.votingSeconds !== undefined) gameData.votingSeconds = update.votingSeconds;
		if (update.nightSeconds !== undefined) gameData.nightSeconds = update.nightSeconds;
		if (update.tieBehavior !== undefined) gameData.tieBehavior = update.tieBehavior;
		if (update.voteCountVisibility !== undefined) gameData.voteCountVisibility = update.voteCountVisibility;
		if (update.anonymousVoting !== undefined) gameData.anonymousVoting = update.anonymousVoting;
		if (update.roleRevealOnDeath !== undefined) gameData.roleRevealOnDeath = update.roleRevealOnDeath;

		if (Object.keys(gameData).length === 0) {
			const row = await this.db.game.findUnique({
				where: { id: gameId },
				select: { id: true },
			});

			if (!row) {
				return false;
			}

			return true;
		}

		await this.db.game.update({
			where: { id: gameId },
			data: gameData,
		});

		return true;
	}
}

export const GameModel = new Model(prisma);
export const GameModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);