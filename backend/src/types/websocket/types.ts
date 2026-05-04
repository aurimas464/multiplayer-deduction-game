import { z } from "zod";
import { JwtPayload } from "jsonwebtoken";
import WebSocket from "ws";
import { GameStatus, roleDistributionMode, tieBehavior, voteCountVisibility, PhaseType, phaseType } from "../entities/game";
import { playerType } from "../entities/player";
import { Role, roleAlignment, RoleAlignment } from "../entities/role";
import { botDifficulty, botPlaystyle } from "../entities/gameBotSetup";
import { ResponseGameChatMessage } from "../entities/gameChatMessage";

// Websocket core extended data
export type ConnectedUserSocket = WebSocket & {
	userToken?: JwtPayload;
	lastPongAt?: number;
	refreshTimer?: ReturnType<typeof setTimeout>;
	expireTimer?: ReturnType<typeof setTimeout>;
	authenticateTimer?: ReturnType<typeof setTimeout>;
	isAuthenticated?: boolean;
	game?: { code: string; id: number };
};

// Lobby state data
const lobbyPlayerSchema = z.object({
	playerId: z.number(),
	type: z.enum(playerType),
	username: z.string().min(1),
	iconEtag: z.string(),
	isReady: z.boolean(),
	isOnline: z.boolean(),
	seatNr: z.number()
});

export const metaSettingsSchema = z.object({
	maxPlayers: z.number(),
	minPlayers: z.number(),
	daySeconds: z.number(),
	votingSeconds: z.number(),
	nightSeconds: z.number(),
	tieBehavior: z.enum(tieBehavior),
	voteCountVisibility: z.enum(voteCountVisibility),
	anonymousVoting: z.boolean(),
	roleRevealOnDeath: z.boolean(),
	roleDistributionMode: z.enum(roleDistributionMode)
});

export const roleSettingsSchema = z.record(
	z.number().min(0),
	z.number().min(0)
);

export const botSettingsSchema = z.record(
	z.number().min(0),
	z.object({
		difficulty: z.enum(botDifficulty),
		playstyle: z.enum(botPlaystyle)
	})
);

export const lobbyStateDataSchema = z.object({
	gameCode: z.string(),
	gameId: z.number(),
	players: z.array(lobbyPlayerSchema),
	metaSettings: metaSettingsSchema,
	roleSettings: roleSettingsSchema,
	botSettings: botSettingsSchema
}).strict();

// Possible player actions
export const playerActionType = ["vote", "skip", "eliminate", "convert", "inspect", "watch", "jail", "protect", "guess"] as const;
export type PlayerActionType = (typeof playerActionType)[number];

// Game state data
export const gameStatePlayerSchema = z.object({
	playerId: z.number(),
	type: z.enum(playerType),
	username: z.string().min(1),
	iconEtag: z.string(),
	seatNr: z.number(),
	isEliminated: z.boolean(),
	isKnownAlly: z.boolean()
});

export const gameStateDataSchema = z.object({
	gameCode: z.string(),
	gameId: z.number(),
	players: z.array(gameStatePlayerSchema),
	myPlayerId: z.number(),
	myRoleKey: z.string(),
	myIsJailed: z.boolean(),
	availableActions: z.array(z.enum(playerActionType)),
	currentPhase: z.enum(phaseType),
	dayNumber: z.number(),
	phaseEndsAt: z.number(),
	phaseStartedAt: z.number()
}).strict();

// Possible phase results
export const phaseResultSchema = z.object({
	votes: z.array(z.object({
		voterPlayerId: z.number().optional(),
		targetPlayerId: z.number().nullable()
	})).optional(),
	eliminated: z.array(z.object({
		playerId: z.number(),
		roleKey: z.string().optional()
	})).optional()
}).strict();

// Possible private phase results
export const personalPhaseResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("eliminate"),
		targetPlayerId: z.number()
	}).strict(),
	z.object({
		type: z.literal("convert"),
		targetPlayerId: z.number()
	}).strict(),
	z.object({
		type: z.literal("inspect"),
		targetPlayerId: z.number(),
		alignment: z.enum(["good", "bad"])
	}).strict(),
	z.object({
		type: z.literal("watch"),
		targetPlayerId: z.number(),
		visitorPlayerIds: z.array(z.number())
	}).strict(),
	z.object({
		type: z.literal("jail"),
		targetPlayerId: z.number(),
		applied: z.boolean()
	}).strict(),
	z.object({
		type: z.literal("jailed")
	}).strict(),
	z.object({
		type: z.literal("protect"),
		targetPlayerId: z.number(),
		wasAttacked: z.boolean()
	}).strict(),
	z.object({
		type: z.literal("guess"),
		targetPlayerId: z.number(),
		roleKey: z.string(),
		correct: z.boolean()
	}).strict(),
	z.object({
		type: z.literal("chronicler_to_guess"),
		roleKey: z.string()
	}).strict(),
	z.object({
		type: z.literal("converted")
	}).strict()
]);

// Game finished result data
export const gameFinishedPlayerSchema = z.object({
	playerId: z.number(),
	username: z.string().min(1),
	roleKey: z.string().min(1),
	isEliminated: z.boolean()
}).strict();

export const gameFinishedActionSchema = z.object({
	playerId: z.number(),
	dayNumber: z.number(),
	phase: z.enum(phaseType),
	type: z.enum(playerActionType),
	targetPlayerId: z.number().nullable()
}).strict();

export const gameFinishedResultSchema = z.object({
	winner: z.enum(roleAlignment),
	winnerPlayerIds: z.array(z.number()),
	players: z.array(gameFinishedPlayerSchema),
	timeline: z.array(gameFinishedActionSchema)
}).strict();

// Types
export type LobbyStateData = z.infer<typeof lobbyStateDataSchema>;
export type LobbyPlayer = z.infer<typeof lobbyPlayerSchema>;
export type GameStatePlayer = z.infer<typeof gameStatePlayerSchema>;
export type GameStateData = z.infer<typeof gameStateDataSchema>;
export type MetaSettings = z.infer<typeof metaSettingsSchema>;
export type RoleSettings = z.infer<typeof roleSettingsSchema>;
export type BotSettings = z.infer<typeof botSettingsSchema>;
export type PhaseResult = z.infer<typeof phaseResultSchema>;
export type PersonalPhaseResult = z.infer<typeof personalPhaseResultSchema>;
export type GameFinishedPlayer = z.infer<typeof gameFinishedPlayerSchema>;
export type GameFinishedAction = z.infer<typeof gameFinishedActionSchema>;
export type GameFinishedResult = z.infer<typeof gameFinishedResultSchema>;

// Session types
export type BaseSession = {
	gameCode: string;
	sockets: Set<ConnectedUserSocket>;
	userSocketCounts: Map<number, number>;
	players: Map<number, LobbyPlayer>;
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
	botSettings: BotSettings;
	status: GameStatus;
	createdAt: number;
	lastActiveAt: number;
	emptySince?: number;
};

export type LobbySession = BaseSession & {
	status: Extract<GameStatus, "lobby" | "starting">;
	gameStartingAt?: number;
	startTimer?: ReturnType<typeof setTimeout>;
};

export type PlayerAction = {
	playerId: number;
	type: PlayerActionType;
	targetPlayerId: number | null;
};

// Game exclusive state
export type PlayerState = {
	// Persistent (whole game)
	runtime: {
		isEliminated: boolean; // Death by vampire, serial killer, vigilante target or vigilante self death
		vampireMissedEliminationCycles: number; // How many cycles vampire missed elimination
		hasUsedConvert: boolean; // Convert used
		isConverted: boolean; // Was targeted by conversion
		serialKillerEliminationCount: number; // Serial killer elimination count
		chroniclerCorrectGuessCount: number; // Chronicler correct guess count
		chroniclerCurrentRoleKey: string | null; // Chronicler to guess
		chroniclerGuessedRoleKeys: Set<string>; // Chronicler guessed role keys
	};
	// Temporary (reset every phase)
	phase: {
		visitedByPlayerIds: Set<number>; // Targetted by actions (for watchman)
		isJailed: boolean; // Jailed (by jailor)
		isProtected: boolean; // Protected (by priest)
		wasProtectedFromElimination: boolean; // Protection was activated (by priest)
	};
};

export type BotNightActionState = {
	roleKey: string | null;
	dayNumber: number;
	vampireMissedEliminationCycles: number;
	hasUsedConvert: boolean;
	chroniclerCurrentRoleKey: string | null;
};

export type InGameDayActionHistory = Record<PhaseType, PlayerAction[]>;

export type FinishedGameWinner = {
	faction: RoleAlignment;
	playerIds: number[];
};

export type InGameSession = BaseSession & {
	status: Extract<GameStatus, "in_progress" | "finished">;

	players: Map<number, LobbyPlayer>;
	playerRoles: Map<number, Role>;

	dayNumber: number;
	currentPhase: PhaseType;

	phaseStartedAt: number;
	phaseEndsAt: number;
	phaseTimer?: ReturnType<typeof setTimeout>;
	botDiscussionTimer?: ReturnType<typeof setTimeout>;

	pendingActions: Map<number, PlayerAction>;
	playerStates: Map<number, PlayerState>;
	gameChatMessages: ResponseGameChatMessage[];

	actionHistory: InGameDayActionHistory[];
	finishedWinner?: FinishedGameWinner;
};

export type Session = LobbySession | InGameSession;
