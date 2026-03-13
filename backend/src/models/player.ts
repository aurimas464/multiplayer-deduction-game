import prisma from "../../prisma/client";
import type { Prisma, Player as PlayerPrisma } from "@prisma/client";
import { Player } from "../types/entities/player";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapPlayer(p: PlayerPrisma): Player {
		return {
			id: p.id,
			icon: p.icon,
			iconEtag: p.iconEtag,
			type: p.type,
			createdAt: p.createdAt,
			updatedAt: p.updatedAt,
		};
	}

	async findByUserId(userId: number): Promise<Player | null> {
		const row = await this.db.userPlayer.findUnique({
			where: { userId },
			include: { player: true },
		});

		return row?.player ? this.mapPlayer(row.player) : null;
	}

	async findIconEtagByUserId(userId: number): Promise<string | null> {
		const row = await this.db.userPlayer.findUnique({
			where: { userId },
			select: { player: { select: { iconEtag: true } } },
		});

		return row?.player?.iconEtag ?? null;
	}

	async getIconsDataUrlByPlayerIds(playerIds: number[]): Promise<Map<number, string>> {
		if (playerIds.length === 0) return new Map();

		const limitedIds = [...new Set(playerIds)].slice(0, 20);

		const rows = await this.db.player.findMany({
			where: { id: { in: limitedIds } },
			select: { id: true, icon: true },
		});

		const icons = new Map<number, string>();
		for (const r of rows) {
			const icon = r.icon?.trim();
			if (icon && icon.length > 0) {
				icons.set(r.id, icon);
			}
		}

		return icons;
	}
}

export const PlayerModel = new Model(prisma);
export const PlayerModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);