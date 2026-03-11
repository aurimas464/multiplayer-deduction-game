import prisma from "../prisma";
import type { GameRoleSetup as GameRoleSetupPrisma, Prisma } from "@prisma/client";
import { GameRoleSetup } from "../types/entities/gameRoleSetup";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGameRoleSetup(g: GameRoleSetupPrisma): GameRoleSetup {
		return {
			id: g.id,
			gameId: g.gameId,
			roleId: g.roleId,
			count: g.count,
			createdAt: g.createdAt,
			updatedAt: g.updatedAt,
		};
	}
}

export const GameRoleSetupModel = new Model(prisma);
export const GameRoleSetupModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);