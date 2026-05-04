import prisma from "../../prisma/client";
import type { Prisma, DirectChat as PrismaDirectChat } from "@prisma/client";
import type { DirectChat, CreateDirectChat, DirectChatItem } from "../types/entities/directChat";
import { AppError, ErrorCode, type Pagination } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapDirectChat(directChat: PrismaDirectChat): DirectChat {
		return {
			id: directChat.id,
			friendshipId: directChat.friendshipId,
			lastMessageId: directChat.lastMessageId,
			lastMessageRead: directChat.lastMessageRead,
			createdAt: directChat.createdAt,
			updatedAt: directChat.updatedAt
		};
	}

	async create(data: CreateDirectChat): Promise<DirectChat> {
		const row = await this.db.directChat.create({ data });

		return this.mapDirectChat(row);
	}

	async findById(id: number): Promise<DirectChat | null> {
		const row = await this.db.directChat.findUnique({
			where: { id }
		});

		return row ? this.mapDirectChat(row) : null;
	}

	async findByFriendshipId(friendshipId: number): Promise<DirectChat | null> {
		const row = await this.db.directChat.findUnique({
			where: { friendshipId }
		});

		return row ? this.mapDirectChat(row) : null;
	}

	async findByUserIdWithDetails(userId: number, pagination: Pagination): Promise<DirectChatItem[]> {
		const rows = await this.db.directChat.findMany({
			where: {
				friendship: {
					OR: [{ userId1: userId }, { userId2: userId }]
				}
			},
			include: {
				friendship: {
					include: {
						user1: { include: { userPlayer: { include: { player: true } } } },
						user2: { include: { userPlayer: { include: { player: true } } } }
					}
				},
				lastMessage: true
			},
			orderBy: {
				lastMessage: {
					createdAt: "desc"
				}
			},
			take: pagination.limit,
			skip: pagination.offset
		});

		return rows.map((row) => {
			const otherUser = row.friendship.userId1 === userId ? row.friendship.user2 : row.friendship.user1;

			if (!otherUser.userPlayer?.player) {
				throw new AppError(ErrorCode.INTERNAL_ERROR);
			}

			return {
				id: row.id,
				friendshipId: row.friendshipId,
				lastMessageRead: row.lastMessageRead,
				lastMessage: row.lastMessage ? {
					senderId: row.lastMessage.senderId,
					message: row.lastMessage.message,
					editedAt: row.lastMessage.editedAt,
					deletedAt: row.lastMessage.deletedAt,
					createdAt: row.lastMessage.createdAt
				} : null,
				user: {
					id: otherUser.id,
					username: otherUser.username,
					player: {
						id: otherUser.userPlayer.player.id,
						iconEtag: otherUser.userPlayer.player.iconEtag
					}
				}
			};
		});
	}

	async countByUserId(userId: number): Promise<number> {
		return await this.db.directChat.count({
			where: {
				friendship: {
					OR: [ { userId1: userId }, { userId2: userId } ]
				}
			}
		});
	}

	async hasUnreadByUserId(userId: number): Promise<boolean> {
		const count = await this.db.directChat.count({
			where: {
				lastMessageRead: false,
				friendship: {
					OR: [{ userId1: userId }, { userId2: userId }]
				}
			}
		});

		return count > 0;
	}

	async markReadByFriendshipId(friendshipId: number): Promise<void> {
		await this.db.directChat.update({
			where: { friendshipId },
			data: { lastMessageRead: true }
		});
	}
}

export const DirectChatModel = new Model(prisma);
export const DirectChatModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);