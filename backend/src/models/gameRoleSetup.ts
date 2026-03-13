import prisma from "../../prisma/client";
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

	public async getByGameId(gameId: number): Promise<GameRoleSetup[]> {
		const rows = await this.db.gameRoleSetup.findMany({
			where: { gameId }
		});

		return rows.map((row) => this.mapGameRoleSetup(row));
	}

	public async upsertRoleSettings(gameId: number, roleSettings: Record<number, number>): Promise<boolean> {
		for (const [roleIdRaw, countRaw] of Object.entries(roleSettings)) {
			const roleId = Number(roleIdRaw);
			const count = Math.max(0, Math.trunc(countRaw));

			await this.db.gameRoleSetup.upsert({
				where: {
					gameId_roleId: {
						gameId,
						roleId
					}
				},
				update: {
					count
				},
				create: {
					gameId,
					roleId,
					count
				}
			});
		}
		return true;
	}
}

export const GameRoleSetupModel = new Model(prisma);
export const GameRoleSetupModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);