import { Request, Response } from "express";
import { ApiResponse, ErrorCode } from "../types";
import UserService from "../services/userService";
import { ensureBody, parseBody } from "../utils/validation";
import { userUpdateSchema, IUserController, playerIconsRequestSchema } from "../types/controllers/user";

class UserController implements IUserController {
	async getMe(req: Request, res: Response): Promise<void> {
		const userId = req.user?.userId;
		if (!userId) {
			res.status(401).json({ success: false, errors: [{ code: ErrorCode.UNAUTHORIZED }] });
			return;
		}

		const dto = await UserService.getMe(userId);
		if (!dto) {
			res.status(404).json({ success: false, errors: [{ code: ErrorCode.USER_NOT_FOUND }] });
			return;
		}

		const successResponse: ApiResponse = { success: true, result: dto };
		res.status(200).json(successResponse);
	}

	async updateUser(req: Request, res: Response): Promise<void> {
		const userId = req.user?.userId;
		if (!userId) {
			res.status(401).json({ success: false, errors: [{ code: ErrorCode.UNAUTHORIZED }] });
			return;
		}

		ensureBody(req);
		const dto = parseBody(userUpdateSchema, req.body);
		if (!dto) return;

		const success = await UserService.updateUser(userId, dto);
		if (!success) {
			res.status(404).json({ success: false, errors: [{ code: ErrorCode.USER_NOT_FOUND }] });
			return;
		}

		const successResponse: ApiResponse = { success: true };
		res.status(200).json(successResponse);
	}

	async getIcons(req: Request, res: Response): Promise<void> {
		ensureBody(req);

		const dto = parseBody(playerIconsRequestSchema, req.body);

		const icons = await UserService.getManyIcons(dto.playerIds);

		const successResponse: ApiResponse = {
			success: true,
			result: icons,
		};

		res.status(200).json(successResponse);
	}
}

export default new UserController();