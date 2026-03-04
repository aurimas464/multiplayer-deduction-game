import { AppError, ErrorCode, type ErrorDetail, type ApiResponse } from "../types"

export function errorCodeToHttpStatus(code: ErrorCode): number {
	switch (code) {
		case ErrorCode.UNAUTHORIZED:
		case ErrorCode.EXPIRED_TOKEN:
		case ErrorCode.MISSING_REFRESH_TOKEN:
			return 401

		case ErrorCode.RATE_LIMIT_EXCEEDED:
			return 429

		case ErrorCode.INVALID_REQUEST:
		case ErrorCode.MISSING_FIELDS:
		case ErrorCode.INVALID_TYPE:
		case ErrorCode.INVALID_TOO_SHORT:
		case ErrorCode.INVALID_TOO_LONG:
		case ErrorCode.INVALID_EMAIL:
		case ErrorCode.INVALID_GAME_CODE:
		case ErrorCode.INVALID_USER_ID:
		case ErrorCode.INVALID_ICON:
		case ErrorCode.TOO_LARGE:
			return 400

		case ErrorCode.USER_NOT_FOUND:
		case ErrorCode.GAME_NOT_FOUND:
		case ErrorCode.FRIEND_REQUEST_NOT_FOUND:
		case ErrorCode.FRIENDSHIP_NOT_FOUND:
			return 404

		case ErrorCode.VALUE_EXISTS:
		case ErrorCode.FRIENDSHIP_ALREADY_EXISTS:
		case ErrorCode.ALREADY_IN_GAME:
		case ErrorCode.GAME_FULL:
		case ErrorCode.GAME_ALREADY_STARTED:
			return 409

		default:
			return 500
	}
}