import { z } from "zod";
import { themes, colorThemes, languages } from "../entities/user";
import { Request, Response } from "express";
import { ErrorCode } from "..";

export const userUpdateSchema = z
	.object({
		username: z.string().optional(),
		email: z.string().optional(),
		theme: z.enum(themes).optional(),
		colorTheme: z.enum(colorThemes).optional(),
		language: z.enum(languages).optional(),
		password: z.string().optional(),
		icon: z.string().optional(),
	})
	.strip();

export type UserUpdateDTO = z.infer<typeof userUpdateSchema>;

export const playerIconsRequestSchema = z.object({
	playerIds: z
		.array(z.number(ErrorCode.INVALID_REQUEST).int(ErrorCode.INVALID_REQUEST).positive(ErrorCode.INVALID_REQUEST), ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(20, ErrorCode.INVALID_TOO_LONG),
});
export type PlayerIconsRequestDTO = z.infer<typeof playerIconsRequestSchema>;

export interface IUserController {
	getMe(req: Request, res: Response): Promise<void>;
	updateUser(req: Request, res: Response): Promise<void>;
	getIcons(req: Request, res: Response): Promise<void>;
}
