import type { ApiResponse, Pagination } from "../types";
import type { BlockedUsersResponse, FriendsResponse, HasPendingRequestsResponse, PendingFriendRequestsResponse, SentFriendRequestsResponse } from "../types/friendship";
import { apiRequest } from "./api/apiRequest";
import api from "./api/api";

export const friendshipService = {
	async getFriends(username?: string): Promise<ApiResponse<FriendsResponse>> {
		const res = await apiRequest<FriendsResponse>(api, {
			method: "GET",
			url: "/friendships/friends",
			params: username ? { username } : undefined
		});

		return res;
	},

	async getPendingRequests(): Promise<ApiResponse<PendingFriendRequestsResponse>> {
		const res = await apiRequest<PendingFriendRequestsResponse>(api, {
			method: "GET",
			url: "/friendships/pending"
		});

		return res;
	},

	async hasPendingRequests(): Promise<ApiResponse<HasPendingRequestsResponse>> {
		const res = await apiRequest<HasPendingRequestsResponse>(api, {
			method: "GET",
			url: "/friendships/pending/exists"
		});

		return res;
	},

	async getSentRequests(): Promise<ApiResponse<SentFriendRequestsResponse>> {
		const res = await apiRequest<SentFriendRequestsResponse>(api, {
			method: "GET",
			url: "/friendships/sent"
		});

		return res;
	},

	async getBlockedUsers(pagination: Pagination, username?: string): Promise<ApiResponse<BlockedUsersResponse>> {
		const params: Pagination & { username?: string } = { ...pagination };
		if (username) {
			params.username = username;
		}

		const res = await apiRequest<BlockedUsersResponse>(api, {
			method: "GET",
			url: "/friendships/blocked",
			params
		});

		return res;
	}
};