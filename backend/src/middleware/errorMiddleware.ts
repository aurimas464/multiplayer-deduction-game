import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "../types";
import { errorCodeToHttpStatus } from "../utils/error";

const VALUE_EXISTS_FIELDS = new Set([
	"username",
	"email"
]);

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
	if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
		const target = Array.isArray(err.meta?.target) ? err.meta.target : undefined;
		const field = target?.length === 1 ? target[0] : undefined;

		if (field && VALUE_EXISTS_FIELDS.has(field)) {
			err = new AppError(ErrorCode.VALUE_EXISTS, [
				{ field, code: ErrorCode.VALUE_EXISTS }
			]);
		}
	}

	if (err instanceof AppError) {
		return res.status(errorCodeToHttpStatus(err.code)).json({
			success: false,
			errors: err.details?.length ? err.details : [{ code: err.code }],
		});
	}

	if (err?.type === "entity.too.large") {
		return res.status(413).json({
			success: false,
			errors: [{ code: ErrorCode.TOO_LARGE }],
		});
	}

	if (process.env.NODE_ENV === "development") {
		console.error(err);
	}

	return res.status(errorCodeToHttpStatus(ErrorCode.INTERNAL_ERROR)).json({
		success: false,
		errors: [{ code: ErrorCode.INTERNAL_ERROR }],
	});
};