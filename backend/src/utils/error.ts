import { ErrorCode, type ErrorCodeType } from "../types"

export function errorCodeToHttpStatus(code: ErrorCodeType): number {
	switch (code) {
		case ErrorCode.UNAUTHORIZED:
		case ErrorCode.EXPIRED_TOKEN:
		case ErrorCode.MISSING_REFRESH_TOKEN:
		case ErrorCode.INVALID_CREDENTIALS:
			return 401;

		case ErrorCode.RATE_LIMIT_EXCEEDED:
		case ErrorCode.TOO_SOON:
			return 429;

		case ErrorCode.INVALID_REQUEST:
		case ErrorCode.MISSING_FIELDS:
		case ErrorCode.INVALID_TYPE:
		case ErrorCode.INVALID_TOO_SHORT:
		case ErrorCode.INVALID_TOO_LONG:
		case ErrorCode.INVALID_EMAIL:
		case ErrorCode.INVALID_ICON:
		case ErrorCode.INVALID_GAME_CODE:
		case ErrorCode.INVALID_SEAT:
		case ErrorCode.INVALID_ACTION:
		case ErrorCode.PLAYER_ELIMINATED:
		case ErrorCode.CHAT_NOT_ALLOWED:
		case ErrorCode.TOO_LARGE:
			return 400;

		case ErrorCode.USER_NOT_FOUND:
		case ErrorCode.GAME_NOT_FOUND:
		case ErrorCode.FRIENDSHIP_NOT_FOUND:
			return 404;

		case ErrorCode.VALUE_EXISTS:
		case ErrorCode.FRIENDSHIP_ALREADY_EXISTS:
		case ErrorCode.FRIENDSHIP_ALREADY_SENT:
		case ErrorCode.FRIEND_REQUEST_EXISTS:
		case ErrorCode.FRIENDS_LIMIT_REACHED:
		case ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED:
		case ErrorCode.FRIEND_REQUEST_INCOMING_LIMIT_REACHED:
		case ErrorCode.ALREADY_IN_GAME:
		case ErrorCode.GAME_FULL:
		case ErrorCode.GAME_NOT_IN_LOBBY:
		case ErrorCode.GAME_ALREADY_STARTED:
		case ErrorCode.SEAT_TAKEN:
			return 409;

		case ErrorCode.NOT_GAME_LEADER:
		case ErrorCode.USER_NOT_FRIEND:
		case ErrorCode.USER_BLOCKED:
		case ErrorCode.PLAYER_NOT_IN_LOBBY:
			return 403;

		case ErrorCode.GAME_NOT_CREATED:
		case ErrorCode.LOBBY_TOO_SMALL:
		case ErrorCode.BOT_NOT_ADDED:
			return 400;

		case ErrorCode.NETWORK_ERROR:
			return 503;

		case ErrorCode.UNKNOWN_ERROR:
		case ErrorCode.INTERNAL_ERROR:
		default:
			return 500;
	}
}
