import type WebSocket from "ws";
import type { JwtPayload } from "./config";
import { z } from "zod";
import { ErrorCode } from "./index";

export type ConnectedUserSocket = WebSocket & {
	userToken?: JwtPayload;
	lastPongAt?: number;
	refreshTimer?: NodeJS.Timeout;
	expireTimer?: NodeJS.Timeout;
	authenticateTimer?: NodeJS.Timeout;
	isAuthenticated?: boolean;
	gameCode?: string;
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
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const lobbyStateDataSchema = z.object({
	players: z.array(
		z.object({
			playerId: z.number(),
			username: z.string().min(1),
			iconEtag: z.string(),
			isReady: z.boolean(),
			isOnline: z.boolean(),
			lastSeenAt: z.number().nullable(),
			seatNr: z.number(),
		}).strict(),
	),
	maxPlayers: z.number(),
	minPlayers: z.number(),
}).strict();
export type LobbyStateData = z.infer<typeof lobbyStateDataSchema>;

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
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;