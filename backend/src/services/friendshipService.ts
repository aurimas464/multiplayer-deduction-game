import prisma from "../../prisma/client";
import { UserModel, UserModelTransaction } from "../repositories/userRepository";
import { FriendshipModel, FriendshipModelTransaction } from "../repositories/friendshipRepository";
import { ResponseUser, responseUsersSchema } from "../types/entities/user";
import { AppError, ErrorCode } from "../types";
import type { PaginatedResult, Pagination } from "../types/index";

const MAX_FRIENDS = 100;
const MAX_OUTGOING_REQUESTS = 10;
const MAX_INCOMING_REQUESTS = 10;

class FriendsService {
	async getFriends(userId: number, username?: string): Promise<ResponseUser[]> {
		const friendships = await FriendshipModel.findAcceptedFriendships(userId);

		const friendIds = friendships.map(f => f.userId1 === userId ? f.userId2 : f.userId1);

		if (friendIds.length === 0) {
			return [];
		}

		const users = await UserModel.findByIds(friendIds);
		const parsedUsers = responseUsersSchema.parse(users);

		return username ? parsedUsers.filter(user => user.username.toLowerCase().includes(username.toLowerCase())) : parsedUsers;
	}

	async getPendingRequests(userId: number): Promise<ResponseUser[]> {
		const friendships = await FriendshipModel.findPendingFriendships(userId);
		const requesterIds = friendships.map(f => f.requestedBy);

		if (requesterIds.length === 0) {
			return [];
		}

		const users = await UserModel.findByIds(requesterIds);

		return responseUsersSchema.parse(users);
	}

	async hasPendingRequests(userId: number): Promise<boolean> {
		const pendingCount = await FriendshipModel.countPendingFriendships(userId);

		return pendingCount > 0;
	}

	async getSentRequests(userId: number): Promise<ResponseUser[]> {
		const friendships = await FriendshipModel.findSentFriendships(userId);

		const targetIds = friendships.map(f => f.userId1 === userId ? f.userId2 : f.userId1);

		if (targetIds.length === 0) {
			return [];
		}

		const users = await UserModel.findByIds(targetIds);

		return responseUsersSchema.parse(users);
	}
	
	async getBlockedUsers(userId: number, pagination: Pagination, username?: string): Promise<PaginatedResult<ResponseUser>> {
		const friendships = await FriendshipModel.findBlockedFriendships(userId, pagination, username);
		const total = await FriendshipModel.countBlockedFriendships(userId, username);
		
		const blockedIds = friendships.map(f => f.userId1 === userId ? f.userId2 : f.userId1);

		if (blockedIds.length === 0) {
			return { data: [], total, offset: pagination.offset, limit: pagination.limit };
		}

		const users = await UserModel.findByIds(blockedIds);
		const parsedUsers = responseUsersSchema.parse(users);

		return { data: parsedUsers, total, offset: pagination.offset, limit: pagination.limit };
	}

	async sendFriendRequest(userId: number, targetUsername: string): Promise<{ targetUser: ResponseUser }> {
		return prisma.$transaction(async (tx) => {
			const userModel = UserModelTransaction(tx);
			const friendshipModel = FriendshipModelTransaction(tx);

			const targetUser = await userModel.findByUsername(targetUsername);
			if (!targetUser) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (targetUser.id === userId) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await this.ensureRequestLimits(friendshipModel, userId, targetUser.id);

			const existingFriendship = await friendshipModel.findByUsers(userId, targetUser.id);
			if (existingFriendship) {
				if (existingFriendship.status === "accepted") {
					throw new AppError(ErrorCode.FRIENDSHIP_ALREADY_EXISTS);
				}

				if (existingFriendship.status === "pending") {
					throw new AppError(
						existingFriendship.requestedBy === userId
							? ErrorCode.FRIENDSHIP_ALREADY_SENT
							: ErrorCode.FRIEND_REQUEST_EXISTS
					);
				}

				if (existingFriendship.status === "blocked") {
					if (existingFriendship.blockedBy === userId) {
						throw new AppError(ErrorCode.INVALID_REQUEST);
					}

					throw new AppError(ErrorCode.USER_BLOCKED);
				}

				await friendshipModel.reRequest(existingFriendship.id, userId);
			} else {
				await friendshipModel.create({
					userId1: userId,
					userId2: targetUser.id,
					requestedBy: userId
				});
			}

			const targetUserWithPlayer = await userModel.findById(targetUser.id);
			if (!targetUserWithPlayer) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			return {
				targetUser: responseUsersSchema.parse([targetUserWithPlayer])[0]
			};
		});
	}

	async acceptFriendRequest(userId: number, targetUserId: number): Promise<{ targetUser: ResponseUser }> {
		return prisma.$transaction(async (tx) => {
			const userModel = UserModelTransaction(tx);
			const friendshipModel = FriendshipModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (friendship.status !== "pending" || friendship.requestedBy !== targetUserId) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await this.ensureFriendLimitOnAccept(friendshipModel, userId, targetUserId);

			await friendshipModel.accept(friendship.id);

			const targetUserWithPlayer = await userModel.findById(targetUserId);
			if (!targetUserWithPlayer) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			return { targetUser: responseUsersSchema.parse([targetUserWithPlayer])[0] };
		});
	}

	async rejectFriendRequest(userId: number, targetUserId: number): Promise<void> {
		await prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (friendship.status !== "pending" || friendship.requestedBy !== targetUserId) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await friendshipModel.decline(friendship.id);
		});
	}

	async removeFriend(userId: number, targetUserId: number): Promise<void> {
		await prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (friendship.status !== "accepted") {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await friendshipModel.unfriend(friendship.id);
		});
	}

	async blockUser(userId: number, targetUserId: number): Promise<{ targetUser: ResponseUser }> {
		return prisma.$transaction(async (tx) => {
			const userModel = UserModelTransaction(tx);
			const friendshipModel = FriendshipModelTransaction(tx);

			const targetUser = await userModel.findById(targetUserId);
			if (!targetUser) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			let friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				friendship = await friendshipModel.create({
					userId1: userId,
					userId2: targetUserId,
					requestedBy: userId
				});
			}

			await friendshipModel.block(friendship.id, userId);

			const targetUserWithPlayer = await userModel.findById(targetUserId);
			if (!targetUserWithPlayer) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			return { targetUser: responseUsersSchema.parse([targetUserWithPlayer])[0] };
		});
	}

	async unblockUser(userId: number, targetUserId: number): Promise<void> {
		await prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (friendship.status !== "blocked" || friendship.blockedBy !== userId) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await friendshipModel.unblock(friendship.id);
		});
	}

	async cancelFriendRequest(userId: number, targetUserId: number): Promise<void> {
		await prisma.$transaction(async (tx) => {
			const friendshipModel = FriendshipModelTransaction(tx);

			const friendship = await friendshipModel.findByUsers(userId, targetUserId);

			if (!friendship) {
				throw new AppError(ErrorCode.USER_NOT_FOUND);
			}

			if (friendship.status !== "pending" || friendship.requestedBy !== userId) {
				throw new AppError(ErrorCode.INVALID_REQUEST);
			}

			await friendshipModel.decline(friendship.id);
		});
	}

	async ensureUsersAreFriends(userId: number, targetUserId: number): Promise<void> {
		const friendship = await FriendshipModel.findByUsers(userId, targetUserId);
		if (!friendship || friendship.status !== "accepted") {
			throw new AppError(ErrorCode.USER_NOT_FRIEND);
		}
	}

	async getAcceptedFriendIds(userId: number): Promise<Set<number>> {
		const friendships = await FriendshipModel.findAcceptedFriendships(userId);

		return new Set(friendships.map((friendship) => (friendship.userId1 === userId ? friendship.userId2 : friendship.userId1)));
	}

	async getUserById(userId: number): Promise<ResponseUser> {
		const user = await UserModel.findById(userId);
		if (!user) {
			throw new AppError(ErrorCode.USER_NOT_FOUND);
		}
		return responseUsersSchema.parse([user])[0];
	}

	private async ensureRequestLimits(friendshipModel: typeof FriendshipModel, userId: number, targetUserId: number): Promise<void> {
		const [senderFriends, targetFriends, senderOutgoing, targetIncoming] = await Promise.all([
			friendshipModel.countAcceptedFriendships(userId),
			friendshipModel.countAcceptedFriendships(targetUserId),
			friendshipModel.countSentFriendships(userId),
			friendshipModel.countPendingFriendships(targetUserId)
		]);

		if (senderFriends >= MAX_FRIENDS || targetFriends >= MAX_FRIENDS) {
			throw new AppError(ErrorCode.FRIENDS_LIMIT_REACHED);
		}

		if (senderOutgoing >= MAX_OUTGOING_REQUESTS) {
			throw new AppError(ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED);
		}

		if (targetIncoming >= MAX_INCOMING_REQUESTS) {
			throw new AppError(ErrorCode.FRIEND_REQUEST_INCOMING_LIMIT_REACHED);
		}
	}

	private async ensureFriendLimitOnAccept(friendshipModel: typeof FriendshipModel, userId: number, targetUserId: number): Promise<void> {
		const [acceptorFriends, requesterFriends] = await Promise.all([
			friendshipModel.countAcceptedFriendships(userId),
			friendshipModel.countAcceptedFriendships(targetUserId)
		]);

		if (acceptorFriends >= MAX_FRIENDS || requesterFriends >= MAX_FRIENDS) {
			throw new AppError(ErrorCode.FRIENDS_LIMIT_REACHED);
		}
	}
}

export default new FriendsService();
