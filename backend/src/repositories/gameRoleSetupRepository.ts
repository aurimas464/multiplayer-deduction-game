import prisma from "../../prisma/client";
import type { GameRoleSetup as GameRoleSetupPrisma, Prisma } from "@prisma/client";
import { CreateGameRoleSetup, GameRoleSetup } from "../types/entities/gameRoleSetup";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapGameRoleSetup(gameRoleSetup: GameRoleSetupPrisma): GameRoleSetup {
		return {
			gameId: gameRoleSetup.gameId,
			roleId: gameRoleSetup.roleId,
			count: gameRoleSetup.count
		};
	}

	public async upsert(data: CreateGameRoleSetup): Promise<void> {
		await this.db.gameRoleSetup.upsert({
			where: {
				gameId_roleId: {
					gameId: data.gameId,
					roleId: data.roleId
				}
			},
			update: {
				count: data.count
			},
			create: {
				gameId: data.gameId,
				roleId: data.roleId,
				count: data.count
			}
		});
	}

	public async findByGameId(gameId: number): Promise<GameRoleSetup[]> {
		const rows = await this.db.gameRoleSetup.findMany({
			where: { gameId }
		});

		return rows.map((row) => this.mapGameRoleSetup(row));
	}
}

export const GameRoleSetupModel = new Model(prisma);
export const GameRoleSetupModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);