import { z } from "zod";
import { ErrorCode } from "../index";

export const registerSchema = z.object({
	username: z
		.string(ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS)
		.min(3, ErrorCode.INVALID_TOO_SHORT)
		.max(191, ErrorCode.INVALID_TOO_LONG),
	email: z
		.string(ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS)
		.regex(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, ErrorCode.INVALID_EMAIL)
		.max(191, ErrorCode.INVALID_TOO_LONG),
	password: z
		.string(ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS)
		.min(8, ErrorCode.INVALID_TOO_SHORT)
		.max(255, ErrorCode.INVALID_TOO_LONG)
});

export const loginSchema = z.object({
	login: z
		.string(ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS),
	password: z
		.string(ErrorCode.MISSING_FIELDS)
		.min(1, ErrorCode.MISSING_FIELDS)
});