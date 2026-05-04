import { AppError, ErrorCode, type ErrorCodeType, Pagination } from "../types";
import { z, type ZodType } from "zod";
import sharp from "sharp";

export function ensureBody(body: unknown): asserts body is Record<string, unknown> {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new AppError(ErrorCode.INVALID_REQUEST);
	}
}

export function parsePagination(query: unknown): Pagination {
	if (!query || typeof query !== "object" || Array.isArray(query)) {
		throw new AppError(ErrorCode.INVALID_REQUEST);
	}

	const { limit, offset } = query as Record<string, unknown>;

	if (limit === undefined || limit === null || limit === "") {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field: "limit", code: ErrorCode.INVALID_REQUEST }
		]);
	}

	if (offset === undefined || offset === null || offset === "") {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field: "offset", code: ErrorCode.INVALID_REQUEST }
		]);
	}

	const parsedLimit = Number(limit);
	const parsedOffset = Number(offset);

	if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field: "limit", code: ErrorCode.INVALID_REQUEST }
		]);
	}

	if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field: "offset", code: ErrorCode.INVALID_REQUEST }
		]);
	}

	const MAX_LIMIT = 100;

	if (parsedLimit > MAX_LIMIT) {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field: "limit", code: ErrorCode.INVALID_REQUEST }
		]);
	}

	return { limit: parsedLimit, offset: parsedOffset };
}

export function parseNumberParam(params: unknown, field: string): number {
	if (!params || typeof params !== "object" || Array.isArray(params)) {
		throw new AppError(ErrorCode.INVALID_REQUEST);
	}

	const value = (params as Record<string, unknown>)[field];

	if (value === undefined || value === null || value === "") {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field, code: ErrorCode.INVALID_REQUEST }
		]);
	}

	const parsedValue = Number(value);

	if (!Number.isInteger(parsedValue) || parsedValue < 0) {
		throw new AppError(ErrorCode.INVALID_REQUEST, [
			{ field, code: ErrorCode.INVALID_REQUEST }
		]);
	}

	return parsedValue;
}

export function validateData<TSchema extends ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> {
	const result = schema.safeParse(body);

	if (!result.success) {
		const errors = result.error.issues.map((issue) => {
			const code = Object.values(ErrorCode).includes(issue.message as ErrorCodeType)
				? (issue.message as ErrorCodeType)
				: ErrorCode.INVALID_REQUEST;

			const path = issue.path.join(".");
			return path ? { field: path, code } : { code };
		});

		throw new AppError(ErrorCode.INVALID_REQUEST, errors);
	}

	return result.data;
}

export async function validateIcon(icon: string): Promise<{ ok: true; value: string } | { ok: false }> {
	if (!icon || icon.trim().length === 0) {
		return { ok: true, value: "" };
	}

	const trimmed = icon.trim();
	const prefix = [
		"data:image/png;base64,",
		"data:image/jpeg;base64,",
		"data:image/gif;base64,",
		"data:image/webp;base64,"
	].find((p) => trimmed.startsWith(p));

	if (!prefix) {
		return { ok: false };
	}

	const base64 = trimmed.slice(prefix.length);

	let buffer: Buffer;
	try {
		buffer = Buffer.from(base64, "base64");
	} catch {
		return { ok: false };
	}

	if (buffer.length === 0) {
		return { ok: false };
	}

	if (buffer.length > 100 * 1024) {
		return { ok: false };
	}

	try {
		const out = await sharp(buffer, { failOnError: true })
			.resize(100, 100, { fit: "cover" })
			.png()
			.toBuffer();

		return { ok: true, value: `data:image/png;base64,${out.toString("base64")}` };
	} catch {
		return { ok: false };
	}
}
