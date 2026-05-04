import prisma from "../../prisma/client";
import type { Bot as PrismaBot, Prisma, Player as PrismaPlayer } from "@prisma/client";
import { Bot, BotWithPlayer, CreateBot } from "../types/entities/bot";
import { Player } from "../types/entities/player";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapBot(bot: PrismaBot): Bot {
		return {
			id: bot.id,
			name: bot.name
		};
	}

	private mapPlayer(player: PrismaPlayer): Player {
		return {
			id: player.id,
			icon: player.icon,
			iconEtag: player.iconEtag,
			type: player.type,
			createdAt: player.createdAt,
			updatedAt: player.updatedAt
		};
	}

	async create(data: CreateBot): Promise<BotWithPlayer> {
		const bot = await this.db.bot.create({data});

		const player = await this.db.player.create({
			data: {
				type: "bot"
			}
		});

		await this.db.botPlayer.create({
			data: {
				botId: bot.id,
				playerId: player.id
			}
		});

		return { ...this.mapBot(bot), player: this.mapPlayer(player) };
	}

	async findByName(name: string): Promise<Bot | null> {
		const row = await this.db.bot.findUnique({
			where: { name }
		});

		return row ? this.mapBot(row) : null;
	}

	async getAvailableBots(excludePlayerIds: number[] = []): Promise<Bot[]> {
		const availableBots = await this.db.bot.findMany({
			where: {
				botPlayer: {
					NOT: {
						playerId: { in: excludePlayerIds }
					}
				}
			}
		});

		return availableBots.map(row => this.mapBot(row));
	}

	async findBotPlayerById(playerId: number): Promise<Bot | null> {
		const botPlayer = await this.db.botPlayer.findUnique({
			where: { playerId },
			include: { bot: true }
		});

		return botPlayer?.bot ? this.mapBot(botPlayer.bot) : null;
	}
}

export const BotModel = new Model(prisma);
export const BotModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);