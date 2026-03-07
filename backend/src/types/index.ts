export const ErrorCode = {
	INVALID_REQUEST: "INVALID_REQUEST",
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
	NETWORK_ERROR: "NETWORK_ERROR",

	MISSING_FIELDS: "MISSING_FIELDS",
	INVALID_TYPE: "INVALID_TYPE",
	VALUE_EXISTS: "VALUE_EXISTS",

	EXPIRED_TOKEN: "EXPIRED_TOKEN",
	INVALID_CREDENTIALS: "CREDENTIALS_INVALID",
	UNAUTHORIZED: "UNAUTHORIZED",

	INVALID_TOO_SHORT: "INVALID_TOO_SHORT",
	INVALID_TOO_LONG: "INVALID_TOO_LONG",
	INVALID_EMAIL: "INVALID_EMAIL",

	MISSING_REFRESH_TOKEN: "MISSING_REFRESH_TOKEN",
	INTERNAL_ERROR: "INTERNAL_ERROR",
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

	INVALID_ICON: "INVALID_ICON",
	TOO_LARGE: "TOO_LARGE",

	GAME_NOT_CREATED: "GAME_NOT_CREATED",
	INVALID_GAME_CODE: "INVALID_GAME_CODE",
	GAME_NOT_FOUND: "GAME_NOT_FOUND",
	NOT_IN_LOBBY: "NOT_IN_LOBBY",
	ALREADY_IN_GAME: "ALREADY_IN_GAME",

	GAME_FULL: "GAME_FULL",
	GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED",
	INVALID_SEAT: "INVALID_SEAT",
	SEAT_TAKEN: "SEAT_TAKEN",
	NOT_GAME_LEADER: "NOT_GAME_LEADER",
	LOBBY_TOO_SMALL: "LOBBY_TOO_SMALL",

	USER_NOT_FOUND: "USER_NOT_FOUND",
	INVALID_USER_ID: "INVALID_USER_ID",
	FRIENDSHIP_ALREADY_EXISTS: "FRIENDSHIP_ALREADY_EXISTS",
	FRIEND_REQUEST_NOT_FOUND: "FRIEND_REQUEST_NOT_FOUND",
	FRIENDSHIP_NOT_FOUND: "FRIENDSHIP_NOT_FOUND",

	USER_NOT_BLOCKED: "USER_NOT_BLOCKED",
} as const

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode]

export type ErrorDetail = {
	field?: string
	code: ErrorCode
}

export type ApiResponse<T = unknown> =
	| { success: true; result?: T }
	| { success: false; errors: ErrorDetail[] }

export class AppError extends Error {
	public readonly code: ErrorCode
	public readonly details?: ErrorDetail[]

	constructor(code: ErrorCode, details?: ErrorDetail[]) {
		super(code)
		this.name = "AppError"
		this.code = code
		this.details = details
	}
}

export type PaginationParams = {
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export type PaginationResponse<T> = {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}