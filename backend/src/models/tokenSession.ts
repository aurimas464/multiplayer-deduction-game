import prisma from "../prisma";
import type { Prisma, Session as SessionPrisma } from "@prisma/client";
import { TokenSession, CreateTokenSession } from "../types/entities/tokenSession";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapSession(session: SessionPrisma): TokenSession {
		return {
			id: session.id,
			userId: session.userId,
			refreshTokenHash: session.refreshTokenHash,
			refreshExpiresAt: session.refreshExpiresAt,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
		};
	}

	async findById(id: number): Promise<TokenSession | null> {
		const session = await this.db.session.findUnique({ where: { id } });
		return session ? this.mapSession(session) : null;
	}

	async findByUserId(userId: number): Promise<TokenSession | null> {
		const session = await this.db.session.findUnique({ where: { userId } });
		return session ? this.mapSession(session) : null;
	}

	async findByTokenHash(refreshTokenHash: string): Promise<TokenSession | null> {
		const session = await this.db.session.findFirst({ where: { refreshTokenHash } });
		return session ? this.mapSession(session) : null;
	}

	async findValidByTokenHash(refreshTokenHash: string): Promise<TokenSession | null> {
		const session = await this.db.session.findFirst({
			where: {
				refreshTokenHash,
				refreshExpiresAt: { gt: new Date() },
			},
		});
		return session ? this.mapSession(session) : null;
	}

	async createOrUpdate(data: CreateTokenSession): Promise<TokenSession> {
		const session = await this.db.session.upsert({
			where: { userId: data.userId },
			update: {
				refreshTokenHash: data.refreshTokenHash,
				refreshExpiresAt: data.refreshExpiresAt,
			},
			create: {
				userId: data.userId,
				refreshTokenHash: data.refreshTokenHash,
				refreshExpiresAt: data.refreshExpiresAt,
			},
		});

		return this.mapSession(session);
	}

	async deleteByTokenHash(refreshTokenHash: string): Promise<boolean> {
		await this.db.session.deleteMany({ where: { refreshTokenHash } });
		return true;
	}

	async deleteExpired(): Promise<boolean> {
		await this.db.session.deleteMany({
			where: { refreshExpiresAt: { lte: new Date() } },
		});
		return true;
	}
}

export const TokenSessionModel = new Model(prisma);
export const TokenSessionModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);