import { ErrorCode } from "./index";

export const GameStatus = ["lobby", "starting", "in_progress", "finished", "cancelled"] as const;
export const PhaseType = ["day", "voting", "night"] as const;
export const TieBehavior = ["no_one_dies", "random_among_tied"] as const;
export const VoteCountVisibility = ["never", "end"] as const;
export const RoleDistributionMode = ["exact", "weighted_random"] as const;
export const PlayerActionType = ["vote", "skip", "eliminate", "convert", "inspect", "watch", "jail", "protect", "guess"] as const;
export const GameChatMessageType = ["player", "system", "bot"] as const;
export const PlayerType = ["user", "bot"] as const;
export const BotDifficulty = ["random", "easy", "normal", "hard"] as const;
export const BotPlaystyle = ["random", "balanced", "aggressive", "passive", "deceptive", "defensive", "chaotic"] as const;

type WsErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
export type PlayerActionName = typeof PlayerActionType[number];

export type RoleAlignment = "vampire" | "commune" | "neutral";

export type RoleSettings = Record<number, number>;
export type BotSettings = Record<number, {
	difficulty: typeof BotDifficulty[number];
	playstyle: typeof BotPlaystyle[number];
}>;

export type LobbyPlayer = {
	playerId: number;
	type: typeof PlayerType[number];
	username: string;
	iconEtag: string;
	isReady: boolean;
	isOnline: boolean;
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
	gameCode: string;
	gameId: number;
	players: LobbyPlayer[];
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
	botSettings: BotSettings;
};

export type GameStatePlayer = {
	playerId: number;
	type: typeof PlayerType[number];
	username: string;
	iconEtag: string;
	seatNr: number;
	isEliminated: boolean;
	isKnownAlly: boolean;
};

export type GameStateData = {
	gameCode: string;
	gameId: number;
	players: GameStatePlayer[];
	myPlayerId: number;
	myRoleKey: string;
	myIsJailed: boolean;
	availableActions: PlayerActionName[];
	currentPhase: typeof PhaseType[number];
	dayNumber: number;
	phaseEndsAt: number;
	phaseStartedAt: number;
};

export type PhaseResult = {
	votes?: Array<{
		voterPlayerId?: number;
		targetPlayerId: number | null;
	}>;
	eliminated?: Array<{
		playerId: number;
		roleKey?: string;
	}>;
};

export type PersonalPhaseResult =
	| { type: "eliminate"; targetPlayerId: number }
	| { type: "convert"; targetPlayerId: number }
	| { type: "inspect"; targetPlayerId: number; alignment: "good" | "bad" }
	| { type: "watch"; targetPlayerId: number; visitorPlayerIds: number[] }
	| { type: "jail"; targetPlayerId: number; applied: boolean }
	| { type: "jailed" }
	| { type: "protect"; targetPlayerId: number; wasAttacked: boolean }
	| { type: "guess"; targetPlayerId: number; roleKey: string; correct: boolean }
	| { type: "chronicler_to_guess"; roleKey: string }
	| { type: "converted" };

export type GameFinishedPlayer = {
	playerId: number;
	username: string;
	roleKey: string;
	isEliminated: boolean;
};

export type GameFinishedAction = {
	playerId: number;
	dayNumber: number;
	phase: typeof PhaseType[number];
	type: typeof PlayerActionType[number];
	targetPlayerId: number | null;
};

export type GameFinishedResult = {
	winner: RoleAlignment;
	winnerPlayerIds: number[];
	players: GameFinishedPlayer[];
	timeline: GameFinishedAction[];
};

export type ResponsePlayer = {
	id: number;
	iconEtag: string | null;
};

export type ResponseUser = {
	id: number;
	username: string;
	player: ResponsePlayer;
};

export type ResponseBot = {
	id: number;
	name: string;
	player: ResponsePlayer;
};

export type ResponseGameChatMessage = {
	id: number;
	gameId: number;
	playerId: number | null;
	message: string;
	messageType: typeof GameChatMessageType[number];
	dayNumber: number;
	phase: typeof PhaseType[number];
	createdAt: Date | string;
	user: ResponseUser | null;
	bot: ResponseBot | null;
};

export type ResponseDirectChatMessage = {
	id: number;
	chatId: number;
	senderId: number;
	message: string;
	editedAt: Date | string | null;
	deletedAt: Date | string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
	user: ResponseUser | null;
};

export type ClientMessage =
	| { type: "PONG"; t: number }
	| { type: "PING"; t: number }
	| { type: "AUTH_UPDATE"; token: string }
	| { type: "CREATE_GAME" }
	| { type: "JOIN_GAME"; gameCode: string }
	| { type: "LEAVE_GAME" }
	| { type: "REQUEST_LOBBY_STATE" }
	| { type: "CHANGE_SEAT"; seatNr: number }
	| { type: "UPDATE_LOBBY_SETTINGS"; metaSettings: Partial<MetaSettings>; roleSettings: RoleSettings }
	| { type: "ADD_BOT" }
	| { type: "CHANGE_BOT_SETTINGS"; botId: number; difficulty: typeof BotDifficulty[number]; playstyle: typeof BotPlaystyle[number] }
	| { type: "KICK_PLAYER"; playerId: number }
	| { type: "SET_READY"; ready: boolean }
	| { type: "REQUEST_GAME_STATE" }
	| { type: "PLAYER_ACTION"; action: typeof PlayerActionType[number]; targetPlayerId: number | null }
	| { type: "SEND_GAME_CHAT_MESSAGE"; message: string }
	| { type: "RECOVER_GAME" }
	| { type: "INVITE_TO_GAME"; targetUserId: number }
	| { type: "SEND_FRIEND_REQUEST"; targetUsername: string }
	| { type: "ACCEPT_FRIEND_REQUEST"; userId: number }
	| { type: "REJECT_FRIEND_REQUEST"; userId: number }
	| { type: "REMOVE_FRIEND"; userId: number }
	| { type: "BLOCK_USER"; userId: number }
	| { type: "UNBLOCK_USER"; userId: number }
	| { type: "CANCEL_FRIEND_REQUEST"; userId: number }
	| { type: "SEND_DIRECT_CHAT_MESSAGE"; targetUserId: number; message: string }
	| { type: "EDIT_DIRECT_CHAT_MESSAGE"; messageId: number; message: string }
	| { type: "DELETE_DIRECT_CHAT_MESSAGE"; messageId: number }
	| { type: "MARK_DIRECT_CHAT_READ"; targetUserId: number }
	| { type: "CHECK_ONLINE"; userIds: number[] };

export type ServerMessage =
	| { type: "ERROR"; code: WsErrorCode; details?: Array<{ field?: string; code: WsErrorCode }> }
	| { type: "PING"; t: number }
	| { type: "PONG"; t: number }
	| { type: "TOKEN_REQUIRED" }
	| { type: "REFRESH_REQUIRED" }
	| { type: "AUTH_OK" }
	| { type: "CREATE_GAME_OK"; gameCode: string }
	| { type: "JOIN_GAME_OK"; gameCode: string }
	| { type: "LEAVE_GAME_OK" }
	| { type: "RECOVER_GAME_OK"; gameCode: string; state: "lobby" | "inGame" }
	| { type: "RECOVER_GAME_NONE" }
	| { type: "LOBBY_STATE"; data: LobbyStateData }
	| { type: "CHANGE_SEAT_OK" }
	| { type: "UPDATE_LOBBY_SETTINGS_OK" }
	| { type: "ADD_BOT_OK" }
	| { type: "CHANGE_BOT_SETTINGS_OK" }
	| { type: "KICK_PLAYER_OK" }
	| { type: "KICKED_FROM_GAME" }
	| { type: "SET_READY_OK" }
	| { type: "GAME_STARTING"; startsAt: number }
	| { type: "GAME_START_CANCELLED" }
	| { type: "GAME_STARTED"; gameId: number; gameCode: string }
	| { type: "GAME_STATE"; data: GameStateData }
	| { type: "PLAYER_ACTION_OK" }
	| { type: "PHASE_RESULTS"; resolvedPhase: typeof PhaseType[number]; dayNumber: number; result: PhaseResult }
	| { type: "PERSONAL_PHASE_RESULTS"; resolvedPhase: typeof PhaseType[number]; dayNumber: number; result: PersonalPhaseResult[] }
	| { type: "GAME_CHAT_MESSAGE"; data: ResponseGameChatMessage }
	| { type: "GAME_FINISHED"; result: GameFinishedResult }
	| { type: "INVITED_TO_GAME"; username: string; gameCode: string }
	| { type: "INVITE_TO_GAME_OK"; targetUserId: number; gameCode: string }
	| { type: "SEND_FRIEND_REQUEST_OK"; targetUser: ResponseUser }
	| { type: "FRIEND_REQUEST_RECEIVED"; fromUser: ResponseUser }
	| { type: "ACCEPT_FRIEND_REQUEST_OK"; targetUser: ResponseUser }
	| { type: "FRIEND_REQUEST_ACCEPTED"; fromUser: ResponseUser }
	| { type: "REJECT_FRIEND_REQUEST_OK"; targetUserId: number }
	| { type: "FRIEND_REQUEST_REJECTED"; fromUserId: number }
	| { type: "REMOVE_FRIEND_OK"; targetUserId: number }
	| { type: "FRIEND_REMOVED_YOU"; fromUserId: number }
	| { type: "BLOCK_USER_OK"; targetUser: ResponseUser }
	| { type: "USER_BLOCKED_YOU"; fromUser: ResponseUser }
	| { type: "UNBLOCK_USER_OK"; targetUserId: number }
	| { type: "CANCEL_FRIEND_REQUEST_OK"; targetUserId: number }
	| { type: "FRIEND_REQUEST_CANCELLED"; fromUserId: number }
	| { type: "DIRECT_CHAT_MESSAGE"; data: ResponseDirectChatMessage }
	| { type: "DIRECT_CHAT_MESSAGE_EDITED"; data: ResponseDirectChatMessage }
	| { type: "DIRECT_CHAT_MESSAGE_DELETED"; messageId: number }
	| { type: "MARK_ONLINE"; userIds: number[] };
