import prisma from "../../prisma/client";
import type { Prisma, DirectChatMessage as PrismaDirectChatMessage } from "@prisma/client";
import type { DirectChatMessage, CreateDirectChatMessage, ResponseDirectChatMessage } from "../types/entities/directChatMessage";
import type { Pagination } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapDirectChatMessage(directChatMessage: PrismaDirectChatMessage): DirectChatMessage {
		return {
			id: directChatMessage.id,
			chatId: directChatMessage.chatId,
			senderId: directChatMessage.senderId,
			message: directChatMessage.message,
			editedAt: directChatMessage.editedAt,
			deletedAt: directChatMessage.deletedAt,
			createdAt: directChatMessage.createdAt,
			updatedAt: directChatMessage.updatedAt
		};
	}

	async create(data: CreateDirectChatMessage): Promise<DirectChatMessage> {
		const row = await this.db.directChatMessage.create({ data });

		await this.db.directChat.update({
			where: { id: data.chatId },
			data: {
				lastMessageId: row.id,
				lastMessageRead: false
			}
		});

		return this.mapDirectChatMessage(row);
	}

	async findById(id: number): Promise<DirectChatMessage | null> {
		const row = await this.db.directChatMessage.findUnique({
			where: { id }
		});

		return row ? this.mapDirectChatMessage(row) : null;
	}

	async findByChatId(chatId: number, pagination: Pagination): Promise<ResponseDirectChatMessage[]> {
		const rows = await this.db.directChatMessage.findMany({
			where: { chatId },
			include: {
				sender: {
					include: {
						userPlayer: {
							include: {
								player: true
							}
						}
					}
				}
			},
			orderBy: [
				{ createdAt: "desc" },
				{ id: "desc" }
			],
			skip: pagination.offset,
			take: pagination.limit
		});

		return rows.map((row) => {
			const user = row.sender?.userPlayer ? {
				id: row.sender.id,
				username: row.sender.username,
				player: {
					id: row.sender.userPlayer.player.id,
					iconEtag: row.sender.userPlayer.player.iconEtag
				}
			} : null;

			return {
				id: row.id,
				chatId: row.chatId,
				senderId: row.senderId,
				message: row.message,
				editedAt: row.editedAt,
				deletedAt: row.deletedAt,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				user
			};
		});
	}
	
	async countByChatId(chatId: number): Promise<number> {
		return await this.db.directChatMessage.count({
			where: { chatId }
		});
	}
	
	async editMessage(id: number, message: string): Promise<void> {
		await this.db.directChatMessage.update({
			where: { id },
			data: {
				message,
				editedAt: new Date()
			}
		});
	}

	async markDeleted(id: number): Promise<void> {
		await this.db.directChatMessage.update({
			where: { id },
			data: {
				deletedAt: new Date()
			}
		});
	}
}

export const DirectChatMessageModel = new Model(prisma);
export const DirectChatMessageModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
