import prisma from "../../prisma/client";
import { Prisma, type GameBotSetup as GameBotSetupPrisma } from "@prisma/client";
import type { CreateGameBotSetup, GameBotSetup, PatchGameBotSetup } from "../types/entities/gameBotSetup";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGameBotSetup(gameBotSetup: GameBotSetupPrisma): GameBotSetup {
		return {
			gameId: gameBotSetup.gameId,
			playerId: gameBotSetup.playerId,
			difficulty: gameBotSetup.difficulty,
			playstyle: gameBotSetup.playstyle,
			memoryJson: gameBotSetup.memoryJson
		};
	}

	async upsert(data: CreateGameBotSetup): Promise<GameBotSetup> {
		const row = await this.db.gameBotSetup.upsert({
			where: {
				gameId_playerId: {
					gameId: data.gameId,
					playerId: data.playerId
				}
			},
			update: {},
			create: {
				gameId: data.gameId,
				playerId: data.playerId
			}
		});

		return this.mapGameBotSetup(row);
	}

	async findByGameId(gameId: number): Promise<GameBotSetup[]> {
		const rows = await this.db.gameBotSetup.findMany({
			where: { gameId }
		});

		return rows.map((row) => this.mapGameBotSetup(row));
	}

	async findByGameIdAndPlayerId(gameId: number, playerId: number): Promise<GameBotSetup | null> {
		const row = await this.db.gameBotSetup.findUnique({
			where: {
				gameId_playerId: {
					gameId,
					playerId
				}
			}
		});

		return row ? this.mapGameBotSetup(row) : null;
	}

	async changeMemoryJson(gameId: number, playerId: number, memoryJson: unknown): Promise<boolean> {
		const result = await this.db.gameBotSetup.updateMany({
			where: {
				gameId,
				playerId
			},
			data: {
				memoryJson: memoryJson === null ? Prisma.JsonNull : (memoryJson as Prisma.InputJsonValue)
			}
		});

		return result.count > 0;
	}

	async patch(patch: PatchGameBotSetup): Promise<void> {
		const data: Prisma.GameBotSetupUpdateInput = {};

		if (patch.difficulty !== undefined) data.difficulty = patch.difficulty;
		if (patch.playstyle !== undefined) data.playstyle = patch.playstyle;

		if (Object.keys(data).length === 0) return;

		await this.db.gameBotSetup.update({
			where: {
				gameId_playerId: {
					gameId: patch.gameId,
					playerId: patch.playerId
				}
			},
			data
		});
	}
}

export const GameBotSetupModel = new Model(prisma);
export const GameBotSetupModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
