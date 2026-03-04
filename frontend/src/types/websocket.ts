import { ErrorCode, type ErrorDetail } from "./index";

export type LobbyPlayer = {
	playerId: number;
	username: string;
	iconEtag: string;
	isReady: boolean;
	isOnline: boolean;
	lastSeenAt: number | null;
	seatNr: number;
	hasIcon: boolean;
};

export type LobbyStateData = {
	players: LobbyPlayer[];
	maxPlayers: number;
	minPlayers: number;
};

export type ClientMessage =
	| { type: "PONG"; t: number }
	| { type: "PING"; t: number }
	| { type: "AUTH_UPDATE"; token: string }
	| { type: "CREATE_GAME" }
	| { type: "JOIN_GAME"; gameCode: string }
	| { type: "LEAVE_GAME" }
	| { type: "REQUEST_LOBBY_STATE" }
	| { type: "RECOVER_GAME" }
	| { type: "CHANGE_SEAT"; seatNr: number }
	| { type: "SET_READY"; ready: boolean };

export type ServerMessage =
	| { type: "ERROR"; code: ErrorCode; details?: ErrorDetail[] }
	| { type: "PING"; t: number }
	| { type: "PONG"; t: number }
	| { type: "TOKEN_REQUIRED" }
	| { type: "REFRESH_REQUIRED" }
	| { type: "AUTH_OK" }
	| { type: "CREATE_GAME_OK"; gameCode: string }
	| { type: "JOIN_GAME_OK"; gameCode: string }
	| { type: "LEAVE_GAME_OK" }
	| { type: "RECOVER_GAME_OK"; gameCode: string }
	| { type: "RECOVER_GAME_NONE" }
	| { type: "LOBBY_STATE"; data: LobbyStateData }
	| { type: "CHANGE_SEAT_OK" }
	| { type: "SET_READY_OK" };