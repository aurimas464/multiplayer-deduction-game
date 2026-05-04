import { Request, Response } from "express";
import { ensureBody, validateData } from "../utils/validation";
import { registerSchema, loginSchema } from "../types/controllers/auth";
import { ApiResponse } from "../types/index";
import AuthService from "../services/authService";
import config from "../config";

class AuthController {
	async register(req: Request, res: Response): Promise<void> {
		ensureBody(req);
		const dto = validateData(registerSchema, req.body);

		const result = await AuthService.register(dto);

		const successResponse: ApiResponse = { success: true, result };
		res.status(201).json(successResponse);
	}

	async login(req: Request, res: Response): Promise<void> {
		ensureBody(req);
		const dto = validateData(loginSchema, req.body);

		const result = await AuthService.login(dto.login, dto.password);

		const successResponse: ApiResponse = {
			success: true,
			result: {
				accessToken: result.accessToken,
				user: result.userData
			}
		};

		res.cookie("refreshToken", result.refreshToken, {
			httpOnly: config.cookie.httpOnly,
			secure: config.cookie.secure,
			sameSite: config.cookie.sameSite,
			domain: config.cookie.domain,
			maxAge: config.cookie.maxAgeDays * 24 * 60 * 60 * 1000
		}).status(200).json(successResponse);
	}

	async refresh(req: Request, res: Response): Promise<void> {
		const refreshToken = req.cookies.refreshToken;

		const result = await AuthService.refresh(refreshToken);

		const successResponse: ApiResponse = {
			success: true,
			result: { accessToken: result.accessToken }
		};

		res.cookie("refreshToken", result.refreshToken, {
			httpOnly: config.cookie.httpOnly,
			secure: config.cookie.secure,
			sameSite: config.cookie.sameSite,
			domain: config.cookie.domain,
			maxAge: config.cookie.maxAgeDays * 24 * 60 * 60 * 1000
		}).status(200).json(successResponse);
	}

	async logout(req: Request, res: Response): Promise<void> {
		const refreshToken = req.cookies?.refreshToken;
		if (refreshToken && typeof refreshToken === "string") {
			await AuthService.logout(refreshToken);
		}

		res.clearCookie("refreshToken", {
			httpOnly: config.cookie.httpOnly,
			secure: config.cookie.secure,
			sameSite: config.cookie.sameSite,
			domain: config.cookie.domain
		}).status(204).end();
	}
}

export default new AuthController();