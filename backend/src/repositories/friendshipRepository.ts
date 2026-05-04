import prisma from "../../prisma/client";
import type { Prisma, Friendship as PrismaFriendship } from "@prisma/client";
import type { Friendship, CreateFriendship } from "../types/entities/friendship";
import type { Pagination } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapFriendship(friendship: PrismaFriendship): Friendship {
		return {
			id: friendship.id,
			userId1: friendship.userId1,
			userId2: friendship.userId2,
			status: friendship.status,
			requestedBy: friendship.requestedBy,
			blockedBy: friendship.blockedBy,
			createdAt: friendship.createdAt,
			updatedAt: friendship.updatedAt
		};
	}

	async create(data: CreateFriendship): Promise<Friendship> {
		const id1 = Math.min(data.userId1, data.userId2);
		const id2 = Math.max(data.userId1, data.userId2);

		const row = await this.db.friendship.create({
			data: {
				...data,
				userId1: id1,
				userId2: id2
			}
		});

		return this.mapFriendship(row);
	}

	async findByUsers(userId1: number, userId2: number): Promise<Friendship | null> {
		const id1 = Math.min(userId1, userId2);
		const id2 = Math.max(userId1, userId2);

		const row = await this.db.friendship.findUnique({
			where: {
				userId1_userId2: {
					userId1: id1,
					userId2: id2
				}
			}
		});

		return row ? this.mapFriendship(row) : null;
	}

	async findById(id: number): Promise<Friendship | null> {
		const row = await this.db.friendship.findUnique({
			where: { id }
		});

		return row ? this.mapFriendship(row) : null;
	}

	async findAcceptedFriendships(userId: number): Promise<Friendship[]> {
		const rows = await this.db.friendship.findMany({
			where: {
				status: "accepted",
				OR: [{ userId1: userId }, { userId2: userId }]
			},
			take: 100
		});

		return rows.map((row) => this.mapFriendship(row));
	}

	async countAcceptedFriendships(userId: number): Promise<number> {
		return await this.db.friendship.count({
			where: {
				status: "accepted",
				OR: [{ userId1: userId }, { userId2: userId }]
			}
		});
	}

	async findPendingFriendships(userId: number): Promise<Friendship[]> {
		const rows = await this.db.friendship.findMany({
			where: {
				status: "pending",
				OR: [{ userId1: userId }, { userId2: userId }],
				NOT: { requestedBy: userId }
			},
			take: 10
		});

		return rows.map((row) => this.mapFriendship(row));
	}

	async countPendingFriendships(userId: number): Promise<number> {
		return await this.db.friendship.count({
			where: {
				status: "pending",
				OR: [{ userId1: userId }, { userId2: userId }],
				NOT: { requestedBy: userId }
			}
		});
	}

	async findSentFriendships(userId: number): Promise<Friendship[]> {
		const rows = await this.db.friendship.findMany({
			where: {
				status: "pending",
				requestedBy: userId
			},
			take: 10
		});

		return rows.map((row) => this.mapFriendship(row));
	}

	async countSentFriendships(userId: number): Promise<number> {
		return await this.db.friendship.count({
			where: {
				status: "pending",
				requestedBy: userId
			}
		});
	}

	async findBlockedFriendships(userId: number, pagination: Pagination, username?: string): Promise<Friendship[]> {
		const rows = await this.db.friendship.findMany({
			where: {
				status: "blocked",
				blockedBy: userId,
				...(username && {
					OR: [
						{ user1: { username: { contains: username } } },
						{ user2: { username: { contains: username } } }
					]
				})
			},
			skip: pagination.offset,
			take: pagination.limit,
			include: {
				user1: true,
				user2: true
			}
		});

		return rows.map((row) => this.mapFriendship(row));
	}

	async countBlockedFriendships(userId: number, username?: string): Promise<number> {
		return await this.db.friendship.count({
			where: {
				status: "blocked",
				blockedBy: userId,
				...(username && {
					OR: [
						{ user1: { username: { contains: username } } },
						{ user2: { username: { contains: username } } }
					]
				})
			}
		});
	}

	async reRequest(id: number, requestedBy: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "pending",
				requestedBy,
				blockedBy: null
			}
		});

		return this.mapFriendship(row);
	}

	async accept(id: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "accepted",
				blockedBy: null
			}
		});

		return this.mapFriendship(row);
	}

	async decline(id: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "removed",
				blockedBy: null
			}
		});

		return this.mapFriendship(row);
	}

	async block(id: number, blockedBy: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "blocked",
				blockedBy
			}
		});

		return this.mapFriendship(row);
	}

	async unblock(id: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "removed",
				blockedBy: null
			}
		});

		return this.mapFriendship(row);
	}

	async unfriend(id: number): Promise<Friendship> {
		const row = await this.db.friendship.update({
			where: { id },
			data: {
				status: "removed",
				blockedBy: null
			}
		});

		return this.mapFriendship(row);
	}
}

export const FriendshipModel = new Model(prisma);
export const FriendshipModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);