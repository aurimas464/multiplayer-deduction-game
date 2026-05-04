import { Request, Response } from "express";
import { ApiResponse } from "../types";
import FriendsService from "../services/friendshipService";
import { parsePagination } from "../utils/validation";

class FriendshipController {
	async getFriends(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const username = req.query.username as string | undefined;
		
		const result = await FriendsService.getFriends(userId, username);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async getPending(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		
		const result = await FriendsService.getPendingRequests(userId);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async hasPending(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;

		const result = await FriendsService.hasPendingRequests(userId);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async getSent(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		
		const result = await FriendsService.getSentRequests(userId);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async getBlocked(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const pagination = parsePagination(req.query);
		const username = (req.query.username as string)?.trim();
		
		const result = await FriendsService.getBlockedUsers(userId, pagination, username);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}
}

export default new FriendshipController();