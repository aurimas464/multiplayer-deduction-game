import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { ApiResponse, ErrorDetail } from "../../types";
import { ErrorCode } from "../../types";

// Check if data matches ApiResponse format
function isApiResponse<T = unknown>(data: unknown): data is ApiResponse<T> {
	if (!data || typeof data !== "object") return false;

	const obj = data as any;

	// Success response (result is optional by type)
	if (obj.success === true) {
		return true;
	}

	// Error response must have an array (can be empty)
	if (obj.success === false) {
		if (!Array.isArray(obj.errors)) return false;

		return obj.errors.every((e: any) => {
			if (!e || typeof e !== "object") return false;

			// Code must be a valid ErrorCode
			if (typeof e.code !== "string" || !(Object.values(ErrorCode) as string[]).includes(e.code)) {
				return false;
			}

			// Field is optional but must be string if present
			if ("field" in e && e.field !== undefined && typeof e.field !== "string") {
				return false;
			}

			return true;
		});
	}

	return false;
}


// Normalize unexpected errors into a safe response
function normalizeUnknownError(): ApiResponse<never> {
	const errors: ErrorDetail[] = [{ code: ErrorCode.UNKNOWN_ERROR }];
	return { success: false, errors };
}

// Normalize expected axios errors into a safe response
function normalizeKnownError(err: unknown): ApiResponse<never> {
	const anyErr = err as any;
	const data = anyErr?.response?.data;

	if (isApiResponse(data) && data.success === false) {
		return data as ApiResponse<never>;
	}

	const hasResponse = !!anyErr?.response;
	const axiosCode = anyErr?.code;
	const msg = typeof anyErr?.message === "string" ? anyErr.message : "";

	const isTimeout =
		axiosCode === "ECONNABORTED" ||
		axiosCode === "ETIMEDOUT" ||
		msg.toLowerCase().includes("timeout");

	const code =
		!hasResponse || isTimeout
			? ErrorCode.NETWORK_ERROR
			: ErrorCode.INTERNAL_ERROR;

	return { success: false, errors: [{ code }] };
}

export async function apiRequest<T>(api: AxiosInstance, config: AxiosRequestConfig): Promise<ApiResponse<T>> {
	try {
		const res = await api.request(config);

		if (isApiResponse<T>(res.data)) {
			return res.data;
		}

		return normalizeUnknownError() as ApiResponse<T>;
	} catch (err) {
		return normalizeKnownError(err) as ApiResponse<T>;
	}
}