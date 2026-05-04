import type { ApiResponse } from "../types";
import type { StatisticsSnapshot } from "../types/statistics";
import { apiRequest } from "./api/apiRequest";
import api from "./api/api";

export const statisticsService = {
	async getGameStats(): Promise<ApiResponse<StatisticsSnapshot>> {
		const res = await apiRequest<StatisticsSnapshot>(api, {
			method: "GET",
			url: "/statistics/games"
		});

		return res;
	},

	async getUserStats(refresh = false): Promise<ApiResponse<StatisticsSnapshot>> {
		const res = await apiRequest<StatisticsSnapshot>(api, {
			method: "GET",
			url: "/statistics/users",
			params: refresh ? { refresh: true } : undefined
		});

		return res;
	}
};