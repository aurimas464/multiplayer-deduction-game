import type { ErrorRequestHandler } from "express"
import { Prisma } from "@prisma/client"
import { AppError, ErrorCode } from "../types"
import { errorCodeToHttpStatus } from "../utils/error"

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
	if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
		const target = err.meta?.target as string[] | undefined
		const field = target?.length === 1 ? target[0] : undefined

		err = new AppError(ErrorCode.VALUE_EXISTS, [
			field ? { field, code: ErrorCode.VALUE_EXISTS } : { code: ErrorCode.VALUE_EXISTS },
		])
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

	if (process.env.NODE_ENV == "development") {
		console.error(err);
	}
	
	return res.status(errorCodeToHttpStatus(ErrorCode.INTERNAL_ERROR)).json({
		success: false,
		errors: [{ code: ErrorCode.INTERNAL_ERROR }],
	});

};
