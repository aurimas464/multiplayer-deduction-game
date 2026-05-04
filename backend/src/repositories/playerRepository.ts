import prisma from "../../prisma/client";
import type { Prisma, Player as PlayerPrisma } from "@prisma/client";
import { Player } from "../types/entities/player";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapPlayer(player: PlayerPrisma): Player {
		return {
			id: player.id,
			icon: player.icon,
			iconEtag: player.iconEtag,
			type: player.type,
			createdAt: player.createdAt,
			updatedAt: player.updatedAt
		};
	}

	async findByUserId(userId: number): Promise<Player | null> {
		const row = await this.db.userPlayer.findUnique({
			where: { userId },
			include: { player: true }
		});

		return row?.player ? this.mapPlayer(row.player) : null;
	}

	async findByBotId(botId: number): Promise<Player | null> {
		const row = await this.db.botPlayer.findUnique({
			where: { botId },
			include: { player: true }
		});

		return row?.player ? this.mapPlayer(row.player) : null;
	}

	async findIconEtagByPlayerId(playerId: number): Promise<string | null> {
		const row = await this.db.player.findUnique({
			where: { id: playerId },
			select: { iconEtag: true }
		});

		return row?.iconEtag ?? null;
	}

	async findIconDataByPlayerIds(playerIds: number[]): Promise<{ id: number; icon: string }[]> {
		if (playerIds.length === 0) return [];

		const rows = await this.db.player.findMany({
			where: {
				id: { in: playerIds },
				icon: { not: null }
			},
			select: { id: true, icon: true }
		});

		return rows.map(row => ({id: row.id, icon: row.icon!}));
	}
}

export const PlayerModel = new Model(prisma);
export const PlayerModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);