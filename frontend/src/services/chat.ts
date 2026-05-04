import type { ApiResponse, Pagination } from "../types";
import type { DirectChatMessagesResponse, DirectChatsResponse, GameChatMessagesResponse, GameChatsResponse } from "../types/chat";
import { apiRequest } from "./api/apiRequest";
import api from "./api/api";

export const chatService = {
	async getDirectChats(pagination: Pagination): Promise<ApiResponse<DirectChatsResponse>> {
		const res = await apiRequest<DirectChatsResponse>(api, {
			method: "GET",
			url: "/chats/direct",
			params: pagination
		});

		return res;
	},

	async getGameChats(pagination: Pagination): Promise<ApiResponse<GameChatsResponse>> {
		const res = await apiRequest<GameChatsResponse>(api, {
			method: "GET",
			url: "/chats/game",
			params: pagination
		});

		return res;
	},

	async hasUnreadDirect(): Promise<ApiResponse<boolean>> {
		const res = await apiRequest<boolean>(api, {
			method: "GET",
			url: "/chats/direct/unread/exists"
		});

		return res;
	},

	async getDirectChatMessages(chatId: number, pagination: Pagination): Promise<ApiResponse<DirectChatMessagesResponse>> {
		const res = await apiRequest<DirectChatMessagesResponse>(api, {
			method: "GET",
			url: `/chats/direct/${chatId}/messages`,
			params: pagination
		});

		return res;
	},

	async getGameChatMessages(gameId: number, pagination: Pagination): Promise<ApiResponse<GameChatMessagesResponse>> {
		const res = await apiRequest<GameChatMessagesResponse>(api, {
			method: "GET",
			url: `/chats/game/${gameId}/messages`,
			params: pagination
		});

		return res;
	}
};