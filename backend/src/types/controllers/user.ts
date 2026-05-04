import { z } from "zod";
import { themes, colorThemes, languages } from "../entities/user";
import { ErrorCode } from "..";

export const userPatchSchema = z.object({
	username: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(191, ErrorCode.INVALID_TOO_LONG)
		.optional(),
	email: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.regex(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, ErrorCode.INVALID_EMAIL)
		.max(191, ErrorCode.INVALID_TOO_LONG)
		.optional(),
	theme: z
		.enum(themes, ErrorCode.INVALID_REQUEST)
		.optional(),
	colorTheme: z
		.enum(colorThemes, ErrorCode.INVALID_REQUEST)
		.optional(),
	language: z
		.enum(languages, ErrorCode.INVALID_REQUEST)
		.optional(),
	password: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.min(8, ErrorCode.INVALID_TOO_SHORT)
		.max(255, ErrorCode.INVALID_TOO_LONG)
		.optional(),
	icon: z
		.string(ErrorCode.INVALID_TYPE)
		.optional()
});

export const playerIconsRequestSchema = z.object({
	playerIds: z.array(
		z
			.number(ErrorCode.INVALID_TYPE)
			.int(ErrorCode.INVALID_TYPE)
			.positive(ErrorCode.INVALID_TYPE)
	)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(20, ErrorCode.INVALID_TOO_LONG)
});