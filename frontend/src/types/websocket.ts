import { ErrorCode, type ErrorDetail } from "./index";

export const GameStatus = ["lobby", "in_progress", "finished", "cancelled"] as const;
export const TieBehavior = ["no_one_dies", "random_among_tied", "revote"] as const;
export const VoteCountVisibility = ["never", "end", "live"] as const;
export const RoleDistributionMode = ["exact", "weighted_random"] as const;
export type RoleSettings = Record<number, number>;

export type LobbyPlayer = {
	playerId: number;
	username: string;
	iconEtag: string;
	isReady: boolean;
	isOnline: boolean;
	lastSeenAt: number | null;
	seatNr: number;
};

export type MetaSettings = {
	maxPlayers: number;
	minPlayers: number;
	daySeconds: number;
	votingSeconds: number;
	nightSeconds: number;
	tieBehavior: typeof TieBehavior[number];
	voteCountVisibility: typeof VoteCountVisibility[number];
	anonymousVoting: boolean;
	roleRevealOnDeath: boolean;
	roleDistributionMode: typeof RoleDistributionMode[number];
};

export type LobbyStateData = {
	players: LobbyPlayer[];
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
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
	| { type: "SET_READY"; ready: boolean }
	| { type: "UPDATE_LOBBY_SETTINGS"; metaSettings: Partial<MetaSettings>; roleSettings: RoleSettings };

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
	| { type: "SET_READY_OK" }
	| { type: "UPDATE_LOBBY_SETTINGS_OK" };