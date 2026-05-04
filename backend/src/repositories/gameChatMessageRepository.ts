import prisma from "../../prisma/client";
import type { Prisma, GameChatMessage as GameChatMessagePrisma } from "@prisma/client";
import { GameChatMessage, CreateGameChatMessage, ResponseGameChatMessage } from "../types/entities/gameChatMessage";
import { Pagination } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGameChatMessage(gameChatMessage: GameChatMessagePrisma): GameChatMessage {
		return {
			id: gameChatMessage.id,
			gameId: gameChatMessage.gameId,
			playerId: gameChatMessage.playerId,
			message: gameChatMessage.message,
			dayNumber: gameChatMessage.dayNumber,
			phase: gameChatMessage.phase,
			messageType: gameChatMessage.messageType,
			createdAt: gameChatMessage.createdAt
		};
	}

	async create(data: CreateGameChatMessage): Promise<GameChatMessage> {
		const row = await this.db.gameChatMessage.create({ data });

		return this.mapGameChatMessage(row);
	}

	async findByGameId(gameId: number, pagination: Pagination): Promise<ResponseGameChatMessage[]> {
		const rows = await this.db.gameChatMessage.findMany({
			where: { gameId },
			include: {
				player: {
					include: {
						user: { include: { user: true } },
						bot: { include: { bot: true } }
					}
				}
			},
			orderBy: [
				{ createdAt: "desc" },
				{ id: "desc" }
			],
			skip: pagination.offset,
			take: pagination.limit
		});

		return rows.map((row) => {
			const user = row.player?.user ? {
				id: row.player.user.user.id,
				username: row.player.user.user.username,
				player: {
					id: row.player.id,
					iconEtag: row.player.iconEtag
				}
			} : null;

			const bot = row.player?.bot ? {
				id: row.player.bot.bot.id,
				name: row.player.bot.bot.name,
				player: {
					id: row.player.id,
					iconEtag: row.player.iconEtag
				}
			} : null;

			return {
				id: row.id,
				gameId: row.gameId,
				playerId: row.playerId,
				message: row.message,
				dayNumber: row.dayNumber,
				phase: row.phase,
				messageType: row.messageType,
				createdAt: row.createdAt,
				user,
				bot
			};
		});
	}

	async countByGameId(gameId: number): Promise<number> {
		return await this.db.gameChatMessage.count({
			where: { gameId }
		});
	}
}

export const GameChatMessageModel = new Model(prisma);
export const GameChatMessageModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
