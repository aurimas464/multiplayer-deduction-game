import { Request, Response } from "express";
import { ApiResponse } from "../types";
import UserService from "../services/userService";
import { ensureBody, validateData } from "../utils/validation";
import { userPatchSchema, playerIconsRequestSchema } from "../types/controllers/user";

class UserController {
	async getMe(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;

		const result = await UserService.getMe(userId);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async patchUser(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		ensureBody(req);
		const dto = validateData(userPatchSchema, req.body);

		await UserService.patchUser({ ...dto, id: userId });

		const successResponse: ApiResponse = { success: true };
		res.status(200).json(successResponse);
	}

	async getIcons(req: Request, res: Response): Promise<void> {
		ensureBody(req);
		const dto = validateData(playerIconsRequestSchema, req.body);

		const result = await UserService.getManyIcons(dto.playerIds);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}
}

export default new UserController();