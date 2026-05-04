import { z } from "zod";
import { ErrorCode } from "..";

export const createNoteRequestSchema = z.object({
	title: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(255, ErrorCode.INVALID_TOO_LONG),
	content: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(10000, ErrorCode.INVALID_TOO_LONG)
});

export const patchNoteRequestSchema = z.object({
	title: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(255, ErrorCode.INVALID_TOO_LONG)
		.optional(),
	content: z
		.string(ErrorCode.INVALID_TYPE)
		.min(1, ErrorCode.MISSING_FIELDS)
		.max(10000, ErrorCode.INVALID_TOO_LONG)
		.optional()
});
