import prisma from "../prisma";
import type { Bot as BotPrisma, Prisma } from "@prisma/client";
import { Bot } from "../types/entities/bot";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapBot(b: BotPrisma): Bot {
		return {
			id: b.id,
			name: b.name,
			createdAt: b.createdAt,
			updatedAt: b.updatedAt,
		};
	}
}

export const BotModel = new Model(prisma);
export const BotModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);