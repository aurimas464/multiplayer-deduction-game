import prisma from "../../prisma/client";
import type { Prisma, Game as GamePrisma } from "@prisma/client";
import type { GameStatus, Game, CreateGame, PatchGame, GameChatMessageItem } from "../types/entities/game";
import type { RoleAlignment } from "../types/entities/role";
import { type Pagination } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGame(game: GamePrisma): Game {
		return {
			id: game.id,
			gameCode: game.gameCode,
			status: game.status,
			phase: game.phase,
			dayNumber: game.dayNumber,
			winnerAlignment: game.winnerAlignment,
			maxPlayers: game.maxPlayers,
			minPlayers: game.minPlayers,
			daySeconds: game.daySeconds,
			votingSeconds: game.votingSeconds,
			nightSeconds: game.nightSeconds,
			tieBehavior: game.tieBehavior,
			voteCountVisibility: game.voteCountVisibility,
			anonymousVoting: game.anonymousVoting,
			roleRevealOnDeath: game.roleRevealOnDeath,
			roleDistributionMode: game.roleDistributionMode,
			createdAt: game.createdAt,
			updatedAt: game.updatedAt
		};
	}

	async lockGameForMutation(gameId: number): Promise<{ id: number; status: GameStatus; maxPlayers: number; gameCode: string } | null> {
		const rows = await this.db.$queryRaw<{ id: number; status: GameStatus; maxPlayers: number; gameCode: string }[]>`
			SELECT id, status, maxPlayers, gameCode
			FROM Game
			WHERE id = ${gameId}
			FOR UPDATE`;
		
		return rows[0] ?? null;
	}

	async create(data: CreateGame): Promise<Game> {
		const row = await this.db.game.create({ data });

		return this.mapGame(row);
	}

	async findByGameId(gameId: number): Promise<Game | null> {
		const row = await this.db.game.findUnique({ 
			where: { id: gameId }
		});

		return row ? this.mapGame(row) : null;
	}

	async findByGameCode(gameCode: string): Promise<Game | null> {
		const row = await this.db.game.findUnique({ 
			where: { gameCode } 
		});

		return row ? this.mapGame(row) : null;
	}

	async findActiveGameByPlayerId(playerId: number): Promise<Game | null> {
		const row = await this.db.game.findFirst({
			where: {
				status: { in: ["lobby", "starting", "in_progress"] },
				participants: { some: { playerId } }
			},
			orderBy: { createdAt: "desc" }
		});

		return row ? this.mapGame(row) : null;
	}

	async changeStatus(gameId: number, status: GameStatus): Promise<void> {
		await this.db.game.update({
			where: { id: gameId },
			data: {
				status
			}
		});
	}

	async completeGame(gameId: number, winnerAlignment: RoleAlignment): Promise<void> {
		await this.db.game.update({
			where: { id: gameId },
			data: {
				status: "finished",
				winnerAlignment
			}
		});
	}

	async patch(patch: PatchGame): Promise<void> {
		const data: Prisma.GameUpdateInput = {};
		
		if (patch.maxPlayers !== undefined) data.maxPlayers = patch.maxPlayers;
		if (patch.minPlayers !== undefined) data.minPlayers = patch.minPlayers;
		if (patch.daySeconds !== undefined) data.daySeconds = patch.daySeconds;
		if (patch.votingSeconds !== undefined) data.votingSeconds = patch.votingSeconds;
		if (patch.nightSeconds !== undefined) data.nightSeconds = patch.nightSeconds;
		if (patch.tieBehavior !== undefined) data.tieBehavior = patch.tieBehavior;
		if (patch.voteCountVisibility !== undefined) data.voteCountVisibility = patch.voteCountVisibility;
		if (patch.roleDistributionMode !== undefined) data.roleDistributionMode = patch.roleDistributionMode;
		if (patch.anonymousVoting !== undefined) data.anonymousVoting = patch.anonymousVoting;
		if (patch.roleRevealOnDeath !== undefined) data.roleRevealOnDeath = patch.roleRevealOnDeath;

		if (Object.keys(data).length === 0) return;

		await this.db.game.update({
			where: { id: patch.id },
			data
		});
	}

	async findGamesByUserIdWithDetails(userId: number, pagination: Pagination): Promise<GameChatMessageItem[]> {
		const rows = await this.db.game.findMany({
			where: {
				participants: { some: { player: { user: { user: { id: userId } } } } },
				status: {
					notIn: ["cancelled", "lobby", "starting"]
				}
			},
			include: {
				gameChatMessages: { orderBy: { createdAt: "desc" }, take: 1 },
				participants: {
					where: { player: { user: { user: { id: userId } } } },
					include: { 
						player: { 
							include: { 
								user: { include: { user: true } },
								bot: { include: { bot: true } }
							} 
						} 
					}
				}
			},
			orderBy: {
				id: "desc"
			},
			take: pagination.limit,
			skip: pagination.offset
		});

		return rows.map((row) => {
			const participant = row.participants[0];
			

			const user = participant.player.user ? {
				id: participant.player.user.user.id,
				username: participant.player.user.user.username,
				player: {
					id: participant.player.id,
					iconEtag: participant.player.iconEtag
				}
			} : null;

			const bot = participant.player.bot ? {
				id: participant.player.bot.bot.id,
				name: participant.player.bot.bot.name,
				player: {
					id: participant.player.id,
					iconEtag: participant.player.iconEtag
				}
			} : null;

			return {
				id: row.id,
				gameCode: row.gameCode,
				status: row.status,
				lastMessage: row.gameChatMessages[0] ? {
					playerId: row.gameChatMessages[0].playerId ?? null,
					message: row.gameChatMessages[0].message,
					messageType: row.gameChatMessages[0].messageType,
					dayNumber: row.gameChatMessages[0].dayNumber,
					phase: row.gameChatMessages[0].phase,
					createdAt: row.gameChatMessages[0].createdAt
				} : null,
				user,
				bot
			};
		});
	}

	async countGamesByUserId(userId: number): Promise<number> {
		return await this.db.game.count({
			where: {
				participants: { some: { player: { user: { user: { id: userId } } } } },
				status: {
					notIn: ["cancelled", "lobby", "starting"]
				}
			}
		});
	}

	async cancelAllNonFinishedGames(): Promise<number> {
		const result = await this.db.game.updateMany({
			where: {
				status: {
					notIn: ["finished", "cancelled"]
				}
			},
			data: {
				status: "cancelled"
			}
		});

		return result.count;
	}
}

export const GameModel = new Model(prisma);
export const GameModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
