import WebSocket from "ws";
import type { ConnectedUserSocket } from "../../types/websocket/types";
import type { ClientMessage } from "../../types/websocket/client";
import type { ServerMessage } from "../../types/websocket/server";
import chatService from "../../services/chatService";
import friendshipService from "../../services/friendshipService";
import gameService from "../../services/gameService";
import { AppError, ErrorCode } from "../../types/index";

export class WSSocialHandler {
	private readonly onlineUsers = new Map<number, Set<ConnectedUserSocket>>();

	constructor(private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) {}

	track(socket: ConnectedUserSocket): void {
		if (!socket.userToken) return;

		const userId = socket.userToken.userId;
		const userSockets = this.onlineUsers.get(userId);

		if (userSockets) {
			userSockets.add(socket);
			return;
		}

		this.onlineUsers.set(userId, new Set([socket]));
	}
	
	untrack(socket: ConnectedUserSocket): void {
		if (!socket.userToken) return;

		const userId = socket.userToken.userId;
		const userSockets = this.onlineUsers.get(userId);
		if (!userSockets) return;

		userSockets.delete(socket);
		if (userSockets.size === 0) {
			this.onlineUsers.delete(userId);
		}
	}

	isUserOnline(userId: number): boolean {
		const userSockets = this.onlineUsers.get(userId);
		if (!userSockets) return false;

		for (const socket of userSockets) {
			if (socket.readyState === WebSocket.OPEN) {
				return true;
			}
		}

		this.onlineUsers.delete(userId);
		return false;
	}

	sendToUserIfOnline(userId: number, message: ServerMessage): void {
		const userSockets = this.onlineUsers.get(userId);
		if (!userSockets) return;

		for (const socket of userSockets) {
			if (socket.readyState !== WebSocket.OPEN) {
				userSockets.delete(socket);
				continue;
			}

			this.sendMessage(socket, message);
		}

		if (userSockets.size === 0) {
			this.onlineUsers.delete(userId);
		}
	}

	async handleMessage(socket: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		switch (msg.type) {
			case "SEND_FRIEND_REQUEST":
				await this.handleSendFriendRequest(socket, msg.targetUsername);
				return;
			case "ACCEPT_FRIEND_REQUEST":
				await this.handleAcceptFriendRequest(socket, msg.userId);
				return;
			case "REJECT_FRIEND_REQUEST":
				await this.handleRejectFriendRequest(socket, msg.userId);
				return;
			case "REMOVE_FRIEND":
				await this.handleRemoveFriend(socket, msg.userId);
				return;
			case "BLOCK_USER":
				await this.handleBlockUser(socket, msg.userId);
				return;
			case "UNBLOCK_USER":
				await this.handleUnblockUser(socket, msg.userId);
				return;
			case "CANCEL_FRIEND_REQUEST":
				await this.handleCancelFriendRequest(socket, msg.userId);
				return;
			case "CHECK_ONLINE":
				await this.handleCheckOnline(socket, msg.userIds);
				return;
			case "INVITE_TO_GAME":
				await this.handleInviteToGame(socket, msg.targetUserId);
				return;
			case "SEND_DIRECT_CHAT_MESSAGE":
				await this.handleSendDirectChatMessage(socket, msg.targetUserId, msg.message);
				return;
			case "EDIT_DIRECT_CHAT_MESSAGE":
				await this.handleEditDirectChatMessage(socket, msg.messageId, msg.message);
				return;
			case "DELETE_DIRECT_CHAT_MESSAGE":
				await this.handleDeleteDirectChatMessage(socket, msg.messageId);
				return;
			case "MARK_DIRECT_CHAT_READ":
				await this.handleMarkDirectChatRead(socket, msg.targetUserId);
				return;
		}
	}

	private async handleSendFriendRequest(socket: ConnectedUserSocket, targetUsername: string): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		const currentUserId = socket.userToken.userId;

		const result = await friendshipService.sendFriendRequest(currentUserId, targetUsername);

		// Get current user data with player info
		const currentUserData = await friendshipService.getUserById(currentUserId);

		this.sendMessage(socket, { type: "SEND_FRIEND_REQUEST_OK", targetUser: result.targetUser });
		this.sendToUserIfOnline(result.targetUser.id, { type: "FRIEND_REQUEST_RECEIVED", fromUser: currentUserData });
	}

	private async handleAcceptFriendRequest(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		const result = await friendshipService.acceptFriendRequest(currentUserId, userId);

		// Get current user data with player info
		const currentUserData = await friendshipService.getUserById(currentUserId);

		this.sendMessage(socket, { type: "ACCEPT_FRIEND_REQUEST_OK", targetUser: result.targetUser });
		this.sendToUserIfOnline(userId, { type: "FRIEND_REQUEST_ACCEPTED", fromUser: currentUserData });
	}

	private async handleRejectFriendRequest(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		await friendshipService.rejectFriendRequest(currentUserId, userId);

		this.sendMessage(socket, { type: "REJECT_FRIEND_REQUEST_OK", targetUserId: userId });
		this.sendToUserIfOnline(userId, { type: "FRIEND_REQUEST_REJECTED", fromUserId: currentUserId });
	}

	private async handleRemoveFriend(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		await friendshipService.removeFriend(currentUserId, userId);

		this.sendMessage(socket, { type: "REMOVE_FRIEND_OK", targetUserId: userId });
		this.sendToUserIfOnline(userId, { type: "FRIEND_REMOVED_YOU", fromUserId: currentUserId });
	}

	private async handleBlockUser(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		const result = await friendshipService.blockUser(currentUserId, userId);

		// Get current user data with player info
		const currentUserData = await friendshipService.getUserById(currentUserId);

		this.sendMessage(socket, { type: "BLOCK_USER_OK", targetUser: result.targetUser });
		this.sendToUserIfOnline(userId, { type: "USER_BLOCKED_YOU", fromUser: currentUserData });
	}

	private async handleUnblockUser(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		await friendshipService.unblockUser(currentUserId, userId);

		this.sendMessage(socket, { type: "UNBLOCK_USER_OK", targetUserId: userId });
	}

	private async handleCancelFriendRequest(socket: ConnectedUserSocket, userId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		await friendshipService.cancelFriendRequest(currentUserId, userId);

		this.sendMessage(socket, { type: "CANCEL_FRIEND_REQUEST_OK", targetUserId: userId });
		this.sendToUserIfOnline(userId, { type: "FRIEND_REQUEST_CANCELLED", fromUserId: currentUserId });
	}

	private async handleCheckOnline(socket: ConnectedUserSocket, userIds: number[]): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		const currentUserId = socket.userToken.userId;
		const friendIds = await friendshipService.getAcceptedFriendIds(currentUserId);

		const onlineUserIds = userIds.filter((id) => friendIds.has(id) && this.isUserOnline(id));

		this.sendMessage(socket, { type: "MARK_ONLINE", userIds: onlineUserIds });
	}

	private async handleInviteToGame(socket: ConnectedUserSocket, targetUserId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentPlayerId = socket.userToken.playerId;
		const currentUserId = socket.userToken.userId;
		await friendshipService.ensureUsersAreFriends(currentUserId, targetUserId);

		const activeGame = await gameService.latestActiveGameForPlayer(currentPlayerId);
		if (!activeGame) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		if (activeGame.status !== "lobby") {
			throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
		}

		this.sendMessage(socket, { type: "INVITE_TO_GAME_OK", targetUserId, gameCode: activeGame.gameCode });
		this.sendToUserIfOnline(targetUserId, { type: "INVITED_TO_GAME", username: socket.userToken.username, gameCode: activeGame.gameCode });
	}

	private async handleSendDirectChatMessage(socket: ConnectedUserSocket, targetUserId: number, message: string): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		const currentUserId = socket.userToken.userId;

		const result = await chatService.sendDirectMessage(currentUserId, targetUserId, message);

		this.sendMessage(socket, { type: "DIRECT_CHAT_MESSAGE", data: result.data });
		this.sendToUserIfOnline(result.recipientId, { type: "DIRECT_CHAT_MESSAGE", data: result.data });
	}

	private async handleEditDirectChatMessage(socket: ConnectedUserSocket, messageId: number, message: string): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;

		const result = await chatService.editDirectMessage(currentUserId, messageId, message);

		this.sendMessage(socket, { type: "DIRECT_CHAT_MESSAGE_EDITED", data: result.data });
		this.sendToUserIfOnline(result.recipientId, { type: "DIRECT_CHAT_MESSAGE_EDITED", data: result.data });
	}

	private async handleDeleteDirectChatMessage(socket: ConnectedUserSocket, messageId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;

		const result = await chatService.deleteDirectMessage(currentUserId, messageId);

		this.sendMessage(socket, { type: "DIRECT_CHAT_MESSAGE_DELETED", messageId });
		this.sendToUserIfOnline(result.recipientId, { type: "DIRECT_CHAT_MESSAGE_DELETED", messageId });
	}

	private async handleMarkDirectChatRead(socket: ConnectedUserSocket, targetUserId: number): Promise<void> {
		if (!socket.userToken) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const currentUserId = socket.userToken.userId;
		await chatService.markDirectChatRead(currentUserId, targetUserId);
	}
}
