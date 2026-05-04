import { Request, Response } from "express";
import { ApiResponse } from "../types";
import StatisticsService from "../services/statisticsService";

class StatisticsController {
	async getGameStats(req: Request, res: Response): Promise<void> {
		void req;
		const result = await StatisticsService.getGlobalStatistics();

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async getUserStats(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const forceRefresh = req.query.refresh === "true";
		const result = await StatisticsService.getPersonalStatistics(userId, forceRefresh);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}
}

export default new StatisticsController();