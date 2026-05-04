import { Request, Response } from "express";
import { ApiResponse } from "../types/index";
import ChatService from "../services/chatService";
import { parsePagination, parseNumberParam } from "../utils/validation";

class ChatController {
	async getDirectChats(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const pagination = parsePagination(req.query);

		const result = await ChatService.getDirectChats(userId, pagination);

		const successResponse: ApiResponse = { success: true, result };
		res.json(successResponse);
	}

	async getGameChats(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const pagination = parsePagination(req.query);

		const result = await ChatService.getGameChats(userId, pagination);

		const successResponse: ApiResponse = { success: true, result };
		res.json(successResponse);
	}

	async hasUnreadDirect(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;

		const result = await ChatService.hasUnreadDirectMessages(userId);

		const successResponse: ApiResponse = { success: true, result };
		res.json(successResponse);
	}

	async getDirectChatMessages(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const pagination = parsePagination(req.query);
		const otherUserId = parseNumberParam(req.params, "chatId");

		const result = await ChatService.getDirectChatMessages(userId, otherUserId, pagination);

		const successResponse: ApiResponse = { success: true, result };
		res.json(successResponse);
	}

	async getGameChatMessages(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const pagination = parsePagination(req.query);
		const gameId = parseNumberParam(req.params, "gameId");

		const result = await ChatService.getGameChatMessages(userId, gameId, pagination);

		const successResponse: ApiResponse = { success: true, result };
		res.json(successResponse);
	}
}

export default new ChatController();