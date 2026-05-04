import prisma from "../../prisma/client";
import type { Prisma, Session as PrismaSession } from "@prisma/client";
import { Session, CreateSession } from "../types/entities/session";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapSession(session: PrismaSession): Session {
		return {
			id: session.id,
			userId: session.userId,
			refreshTokenHash: session.refreshTokenHash,
			refreshExpiresAt: session.refreshExpiresAt,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt
		};
	}

	async create(data: CreateSession): Promise<Session> {
		const row = await this.db.session.create({ data });
		
		return this.mapSession(row);
	}

	async rotateByTokenHash(oldData: Session, newData: CreateSession): Promise<number> {
		const count = await this.db.session.updateMany({
			where: {
				id: oldData.id,
				userId: oldData.userId,
				refreshTokenHash: oldData.refreshTokenHash,
				refreshExpiresAt: { gt: new Date() }
			},
			data: {
				refreshTokenHash: newData.refreshTokenHash,
				refreshExpiresAt: newData.refreshExpiresAt
			}
		});

		return count.count;
	}

	async findByValidTokenHash(refreshTokenHash: string): Promise<Session | null> {
		const row = await this.db.session.findFirst({
			where: { refreshTokenHash, refreshExpiresAt: { gt: new Date() } }
		});

		return row ? this.mapSession(row) : null;
	}

	async deleteByTokenHash(refreshTokenHash: string): Promise<void> {
		await this.db.session.delete({
			where: { refreshTokenHash }
		});
	}
}

export const SessionModel = new Model(prisma);
export const SessionModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);