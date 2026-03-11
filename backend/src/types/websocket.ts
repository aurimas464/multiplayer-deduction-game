import type WebSocket from "ws";
import type { JwtPayload } from "./config";
import { z } from "zod";
import { ErrorCode } from "./index";
import { TieBehavior, VoteCountVisibility } from "../types/entities/game";

export type ConnectedUserSocket = WebSocket & {
	userToken?: JwtPayload;
	lastPongAt?: number;
	refreshTimer?: NodeJS.Timeout;
	expireTimer?: NodeJS.Timeout;
	authenticateTimer?: NodeJS.Timeout;
	isAuthenticated?: boolean;
	game?: [string, number];
};

const lobbyPlayerSchema = z.object({
	playerId: z.number(),
	username: z.string().min(1),
	iconEtag: z.string(),
	isReady: z.boolean(),
	isOnline: z.boolean(),
	lastSeenAt: z.number().nullable(),
	seatNr: z.number()
}).strict();

export const metaSettingsSchema = z.object({
	maxPlayers: z.number(),
	minPlayers: z.number(),
	daySeconds: z.number(),
	votingSeconds: z.number(),
	nightSeconds: z.number(),
	tieBehavior: z.enum(TieBehavior),
	voteCountVisibility: z.enum(VoteCountVisibility),
	anonymousVoting: z.boolean(),
	roleRevealOnDeath: z.boolean()
}).strict();

export const roleSettingsSchema = z.object({

}).strict();

export type LobbyPlayer = z.infer<typeof lobbyPlayerSchema>;
export type MetaSettings = z.infer<typeof metaSettingsSchema>;
export type RoleSettings = z.infer<typeof roleSettingsSchema>;

export const lobbyStateDataSchema = z.object({
	players: z.array(lobbyPlayerSchema),
	metaSettings: metaSettingsSchema,
	roleSettings: roleSettingsSchema
}).strict();

export type LobbyStateData = z.infer<typeof lobbyStateDataSchema>;

export type SessionPlayer = {
	type: "user" | "bot";
	playerId: number;
	username: string;
	isReady: boolean;
	seatNr: number;
	iconEtag: string;
	joinedAt: number;
	isOnline: boolean;
	lastSeenAt: number;
};

export type GameSession = {
	sockets: Set<ConnectedUserSocket>;
	players: Map<number, SessionPlayer>;
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
	userSocketCounts: Map<number, number>;
	createdAt: number;
	lastActiveAt: number;
	emptySince?: number;
};

export const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("PONG"),
		t: z.number(),
	}).strict(),
	z.object({
		type: z.literal("PING"),
		t: z.number(),
	}).strict(),
	z.object({
		type: z.literal("AUTH_UPDATE"),
		token: z.string().min(1),
	}).strict(),
	z.object({
		type: z.literal("CREATE_GAME"),
	}).strict(),
	z.object({
		type: z.literal("JOIN_GAME"),
		gameCode: z.string().min(1),
	}).strict(),
	z.object({
		type: z.literal("LEAVE_GAME"),
	}).strict(),
	z.object({
		type: z.literal("REQUEST_LOBBY_STATE"),
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME"),
	}).strict(),
	z.object({
		type: z.literal("CHANGE_SEAT"),
		seatNr: z.number(),
	}).strict(),
	z.object({
		type: z.literal("SET_READY"),
		ready: z.boolean(),
	}).strict(),
	z.object({
		type: z.literal("UPDATE_LOBBY_SETTINGS"),
		metaSettings: metaSettingsSchema.partial(),
		roleSettings: roleSettingsSchema.partial(),
	}).strict()
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("ERROR"),
		code: z.enum(ErrorCode),
		details: z.array(
			z.object({
				field: z.string().optional(),
				code: z.enum(ErrorCode),
			})
		).optional(),
	}).strict(),
	z.object({
		type: z.literal("PING"),
		t: z.number(),
	}).strict(),
	z.object({
		type: z.literal("PONG"),
		t: z.number(),
	}).strict(),
	z.object({
		type: z.literal("TOKEN_REQUIRED"),
	}).strict(),
	z.object({
		type: z.literal("REFRESH_REQUIRED"),
	}).strict(),
	z.object({
		type: z.literal("AUTH_OK"),
	}).strict(),
	z.object({
		type: z.literal("CREATE_GAME_OK"),
		gameCode: z.string(),
	}).strict(),
	z.object({
		type: z.literal("JOIN_GAME_OK"),
		gameCode: z.string(),
	}).strict(),
	z.object({
		type: z.literal("LEAVE_GAME_OK"),
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME_OK"),
		gameCode: z.string(),
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME_NONE"),
	}).strict(),
	z.object({
		type: z.literal("LOBBY_STATE"),
		data: lobbyStateDataSchema,
	}).strict(),
	z.object({
		type: z.literal("CHANGE_SEAT_OK"),
	}).strict(),
	z.object({
		type: z.literal("SET_READY_OK"),
	}).strict(),
	z.object({
		type: z.literal("UPDATE_LOBBY_SETTINGS_OK"),
	}).strict(),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;