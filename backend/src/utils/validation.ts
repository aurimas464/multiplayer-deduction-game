import { AppError, ErrorCode } from "../types";
import { z, type ZodType } from "zod";
import sharp from "sharp";

export function ensureBody(body: unknown): asserts body is Record<string, unknown> {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		throw new AppError(ErrorCode.INVALID_REQUEST);
	}
}

export function parseBody<TSchema extends ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> {
	const result = schema.safeParse(body);

	if (!result.success) {
		const errors = result.error.issues.map((issue) => {
			const code = Object.values(ErrorCode).includes(issue.message as ErrorCode)
				? (issue.message as ErrorCode)
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