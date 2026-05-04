import prisma from "../../prisma/client";
import { DirectChatModel } from "../repositories/directChatRepository";
import { DirectChatModelTransaction } from "../repositories/directChatRepository";
import { DirectChatMessageModelTransaction } from "../repositories/directChatMessageRepository";
import { FriendshipModel } from "../repositories/friendshipRepository";
import { FriendshipModelTransaction } from "../repositories/friendshipRepository";
import { GameModel } from "../repositories/gameRepository";
import { GameChatMessageModel } from "../repositories/gameChatMessageRepository";
import { ParticipantModel } from "../repositories/participantRepository";
import { UserModel } from "../repositories/userRepository";
import { UserModelTransaction } from "../repositories/userRepository";
import { AppError, ErrorCode } from "../types/index";
import type { Pagination } from "../types";
import type { PaginatedResult } from "../types";
import type { DirectChatItem } from "../types/entities/directChat";
import type { ResponseDirectChatMessage } from "../types/entities/directChatMessage";
import type { GameChatMessageItem } from "../types/entities/game";
import type { ResponseGameChatMessage, CreateGameChatMessage } from "../types/entities/gameChatMessage";

class ChatService {
	async getDirectChats(userId: number, pagination: Pagination): Promise<PaginatedResult<DirectChatItem>> {
		const directChats = await DirectChatModel.findByUserIdWithDetails(userId, pagination);
		const directChatTotal = await DirectChatModel.countByUserId(userId);
		
		return { data: directChats, total: directChatTotal, offset: pagination.offset, limit: pagination.limit };
	}

	async getGameChats(userId: number, pagination: Pagination): Promise<PaginatedResult<GameChatMessageItem>> {
		const gameChats = await GameModel.findGamesByUserIdWithDetails(userId, pagination);
		const gameChatTotal = await GameModel.countGamesByUserId(userId);
		
		return { data: gameChats, total: gameChatTotal, offset: pagination.offset, limit: pagination.limit };
	}

	async hasUnreadDirectMessages(userId: number): Promise<boolean> {
		return DirectChatModel.hasUnreadByUserId(userId);
	}

	async markDirectChatRead(userId: number, targetUserId: number): Promise<void> {
		const friendship = await FriendshipModel.findByUsers(userId, targetUserId);
		if (!friendship || friendship.status !== "accepted") {
			throw new AppError(ErrorCode.USER_NOT_FRIEND);
		}

		const directChat = await DirectChatModel.findByFriendshipId(friendship.id);
		if (!directChat) {
			return;
		}

		await DirectChatModel.markReadByFriendshipId(friendship.id);
	}

	async getDirectChatMessages(userId: number, otherUserId: number, pagination: Pagination): Promise<PaginatedResult<ResponseDirectChatMessage>> {
		return prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);
			const directChatModel = DirectChatModelTransaction(tx);
			const directChatMessageModel = DirectChatMessageModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, otherUserId);
			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FRIEND, [{ code: ErrorCode.USER_NOT_FRIEND }]);
			}

			const directChat = await this.findOrCreateDirectChat(friendship.id, directChatModel);

			const messages = await directChatMessageModel.findByChatId(directChat.id, pagination);
			const total = await directChatMessageModel.countByChatId(directChat.id);
			
			return { data: messages, total, offset: pagination.offset, limit: pagination.limit };
		});
	}

	async getGameChatMessages(userId: number, gameId: number, pagination: Pagination): Promise<PaginatedResult<ResponseGameChatMessage>> {
		const userWithPlayer = await UserModel.findById(userId);
		if (!userWithPlayer) {
			throw new AppError(ErrorCode.USER_NOT_FOUND, [{ code: ErrorCode.USER_NOT_FOUND }]);
		}
		
		const playerId = userWithPlayer.player.id;

		const participant = await ParticipantModel.findByGameIdAndPlayerId(gameId, playerId);
		if (!participant) {
			throw new AppError(ErrorCode.UNAUTHORIZED, [{ code: ErrorCode.UNAUTHORIZED }]);
		}

		const messages = await GameChatMessageModel.findByGameId(gameId, pagination);
		const total = await GameChatMessageModel.countByGameId(gameId);
		
		return { data: messages, total, offset: pagination.offset, limit: pagination.limit };
	}

	async sendGameMessage(data: CreateGameChatMessage): Promise<ResponseGameChatMessage> {
		await GameChatMessageModel.create(data);
		const messages = await GameChatMessageModel.findByGameId(data.gameId, { offset: 0, limit: 1 });
		return messages[0];
	}

	async sendDirectMessage(senderId: number, targetUserId: number, message: string): Promise<{ data: ResponseDirectChatMessage; recipientId: number }> {
		return prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);
			const directChatModel = DirectChatModelTransaction(tx);
			const directChatMessageModel = DirectChatMessageModelTransaction(tx);
			const userModel = UserModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(senderId, targetUserId);
			if (!friendship || friendship.status !== "accepted") {
				throw new AppError(ErrorCode.USER_NOT_FRIEND);
			}

			const directChat = await this.findOrCreateDirectChat(friendship.id, directChatModel);

			const createdMessage = await directChatMessageModel.create({ chatId: directChat.id, senderId, message });

			const sender = await userModel.findById(senderId);
			if (!sender) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			const responseMessage: ResponseDirectChatMessage = {
				id: createdMessage.id,
				chatId: createdMessage.chatId,
				senderId: createdMessage.senderId,
				message: createdMessage.message,
				editedAt: createdMessage.editedAt,
				deletedAt: createdMessage.deletedAt,
				createdAt: createdMessage.createdAt,
				updatedAt: createdMessage.updatedAt,
				user: {
					id: sender.id,
					username: sender.username,
					player: {
						id: sender.player.id,
						iconEtag: sender.player.iconEtag
					}
				}
			};

			const recipientId = friendship.userId1 === senderId ? friendship.userId2 : friendship.userId1;

			return { data: responseMessage, recipientId };
		});
	}

	async editDirectMessage(senderId: number, messageId: number, message: string): Promise<{ data: ResponseDirectChatMessage; recipientId: number }> {
		return prisma.$transaction(async (tx) => {
			const directChatMessageModel = DirectChatMessageModelTransaction(tx);
			const directChatModel = DirectChatModelTransaction(tx);
			const friendshipModel = FriendshipModelTransaction(tx);
			const userModel = UserModelTransaction(tx);

			const existingMessage = await directChatMessageModel.findById(messageId);
			if (!existingMessage) {
				throw new AppError(ErrorCode.FRIENDSHIP_NOT_FOUND);
			}

			if (existingMessage.senderId !== senderId) {
				throw new AppError(ErrorCode.UNAUTHORIZED);
			}

			if (existingMessage.deletedAt) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			const directChat = await directChatModel.findById(existingMessage.chatId);
			if (!directChat) {
				throw new AppError(ErrorCode.FRIENDSHIP_NOT_FOUND);
			}

			const friendship = await friendshipModel.findById(directChat.friendshipId);
			if (!friendship || friendship.status !== "accepted") {
				throw new AppError(ErrorCode.USER_NOT_FRIEND);
			}

			await directChatMessageModel.editMessage(messageId, message);

			const updatedMessage = await directChatMessageModel.findById(messageId);
			if (!updatedMessage) {
				throw new AppError(ErrorCode.INTERNAL_ERROR);
			}

			const sender = await userModel.findById(senderId);
			if (!sender) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			const responseMessage: ResponseDirectChatMessage = {
				id: updatedMessage.id,
				chatId: updatedMessage.chatId,
				senderId: updatedMessage.senderId,
				message: updatedMessage.message,
				editedAt: updatedMessage.editedAt,
				deletedAt: updatedMessage.deletedAt,
				createdAt: updatedMessage.createdAt,
				updatedAt: updatedMessage.updatedAt,
				user: {
					id: sender.id,
					username: sender.username,
					player: {
						id: sender.player.id,
						iconEtag: sender.player.iconEtag
					}
				}
			};

			const recipientId = friendship.userId1 === senderId ? friendship.userId2 : friendship.userId1;

			return { data: responseMessage, recipientId };
		});
	}

	async deleteDirectMessage(senderId: number, messageId: number): Promise<{ recipientId: number }> {
		return prisma.$transaction(async (tx) => {
			const directChatMessageModel = DirectChatMessageModelTransaction(tx);
			const directChatModel = DirectChatModelTransaction(tx);
			const friendshipModel = FriendshipModelTransaction(tx);

			const existingMessage = await directChatMessageModel.findById(messageId);
			if (!existingMessage) {
				throw new AppError(ErrorCode.FRIENDSHIP_NOT_FOUND);
			}

			if (existingMessage.senderId !== senderId) {
				throw new AppError(ErrorCode.UNAUTHORIZED);
			}

			if (existingMessage.deletedAt) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			const directChat = await directChatModel.findById(existingMessage.chatId);
			if (!directChat) {
				throw new AppError(ErrorCode.FRIENDSHIP_NOT_FOUND);
			}

			const friendship = await friendshipModel.findById(directChat.friendshipId);
			if (!friendship || friendship.status !== "accepted") {
				throw new AppError(ErrorCode.USER_NOT_FRIEND);
			}

			await directChatMessageModel.markDeleted(messageId);

			const recipientId = friendship.userId1 === senderId ? friendship.userId2 : friendship.userId1;

			return { recipientId };
		});
	}

	private async findOrCreateDirectChat(friendshipId: number, directChatModel: typeof DirectChatModel): Promise<Awaited<ReturnType<typeof DirectChatModel.findByFriendshipId>> extends infer T ? Exclude<T, null> : never> {
		let directChat = await directChatModel.findByFriendshipId(friendshipId);
		if (directChat) {
			return directChat;
		}

		try {
			return await directChatModel.create({ friendshipId });
		} catch (err: unknown) {
			const e = err as { code?: string };
			if (e?.code === "P2002") {
				directChat = await directChatModel.findByFriendshipId(friendshipId);
				if (directChat) {
					return directChat;
				}
			}

			throw err;
		}
	}
}

export default new ChatService();