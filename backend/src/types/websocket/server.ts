import { z } from "zod";
import { ErrorCode } from "../index";
import { phaseType, responseGameChatMessageSchema } from "../entities/gameChatMessage";
import { responseDirectChatMessageSchema } from "../entities/directChatMessage";
import { responseUserSchema } from "../entities/user";
import { lobbyStateDataSchema, gameStateDataSchema, personalPhaseResultSchema, phaseResultSchema, gameFinishedResultSchema } from "./types";

export const serverMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("ERROR"),
		code: z.enum(ErrorCode),
		details: z.array(
			z.object({
				field: z.string().optional(),
				code: z.enum(ErrorCode)
			}).strict()
		).optional()
	}).strict(),
	z.object({
		type: z.literal("PING"),
		t: z.number()
	}).strict(),
	z.object({
		type: z.literal("PONG"),
		t: z.number()
	}).strict(),
	z.object({
		type: z.literal("TOKEN_REQUIRED")
	}).strict(),
	z.object({
		type: z.literal("REFRESH_REQUIRED")
	}).strict(),
	z.object({
		type: z.literal("AUTH_OK")
	}).strict(),
	z.object({
		type: z.literal("CREATE_GAME_OK"),
		gameCode: z.string()
	}).strict(),
	z.object({
		type: z.literal("JOIN_GAME_OK"),
		gameCode: z.string()
	}).strict(),
	z.object({
		type: z.literal("LEAVE_GAME_OK")
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME_OK"),
		gameCode: z.string(),
		state: z.enum(["lobby", "inGame"])
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME_NONE")
	}).strict(),
	z.object({
		type: z.literal("LOBBY_STATE"),
		data: lobbyStateDataSchema
	}).strict(),
	z.object({
		type: z.literal("CHANGE_SEAT_OK")
	}).strict(),
	z.object({
		type: z.literal("UPDATE_LOBBY_SETTINGS_OK")
	}).strict(),
	z.object({
		type: z.literal("ADD_BOT_OK")
	}).strict(),
	z.object({
		type: z.literal("CHANGE_BOT_SETTINGS_OK")
	}).strict(),
	z.object({
		type: z.literal("KICK_PLAYER_OK")
	}).strict(),
	z.object({
		type: z.literal("KICKED_FROM_GAME")
	}).strict(),
	z.object({
		type: z.literal("SET_READY_OK")
	}).strict(),
	z.object({
		type: z.literal("GAME_STARTING"),
		startsAt: z.number()
	}).strict(),
	z.object({
		type: z.literal("GAME_START_CANCELLED")
	}).strict(),
	z.object({
		type: z.literal("GAME_STARTED"),
		gameId: z.number(),
		gameCode: z.string()
	}).strict(),
	z.object({
		type: z.literal("GAME_STATE"),
		data: gameStateDataSchema
	}).strict(),
	z.object({
		type: z.literal("PLAYER_ACTION_OK")
	}).strict(),
	z.object({
		type: z.literal("PHASE_RESULTS"),
		resolvedPhase: z.enum(phaseType),
		dayNumber: z.number(),
		result: phaseResultSchema
	}).strict(),
	z.object({
		type: z.literal("PERSONAL_PHASE_RESULTS"),
		resolvedPhase: z.enum(phaseType),
		dayNumber: z.number(),
		result: z.array(personalPhaseResultSchema)
	}).strict(),
	z.object({
		type: z.literal("GAME_CHAT_MESSAGE"),
		data: responseGameChatMessageSchema
	}).strict(),
	z.object({
		type: z.literal("GAME_FINISHED"),
		result: gameFinishedResultSchema
	}).strict(),
	z.object({
		type: z.literal("INVITED_TO_GAME"),
		username: z.string(),
		gameCode: z.string()
	}).strict(),
	z.object({
		type: z.literal("INVITE_TO_GAME_OK"),
		targetUserId: z.number(),
		gameCode: z.string()
	}).strict(),
	z.object({
		type: z.literal("SEND_FRIEND_REQUEST_OK"),
		targetUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("FRIEND_REQUEST_RECEIVED"),
		fromUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("ACCEPT_FRIEND_REQUEST_OK"),
		targetUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("FRIEND_REQUEST_ACCEPTED"),
		fromUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("REJECT_FRIEND_REQUEST_OK"),
		targetUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("FRIEND_REQUEST_REJECTED"),
		fromUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("REMOVE_FRIEND_OK"),
		targetUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("FRIEND_REMOVED_YOU"),
		fromUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("BLOCK_USER_OK"),
		targetUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("USER_BLOCKED_YOU"),
		fromUser: responseUserSchema
	}).strict(),
	z.object({
		type: z.literal("UNBLOCK_USER_OK"),
		targetUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("CANCEL_FRIEND_REQUEST_OK"),
		targetUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("FRIEND_REQUEST_CANCELLED"),
		fromUserId: z.number()
	}).strict(),
	z.object({
		type: z.literal("DIRECT_CHAT_MESSAGE"),
		data: responseDirectChatMessageSchema
	}).strict(),
	z.object({
		type: z.literal("DIRECT_CHAT_MESSAGE_EDITED"),
		data: responseDirectChatMessageSchema
	}).strict(),
	z.object({
		type: z.literal("DIRECT_CHAT_MESSAGE_DELETED"),
		messageId: z.number()
	}).strict(),
	z.object({
		type: z.literal("MARK_ONLINE"),
		userIds: z.array(z.number())
	}).strict()
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;