import { z } from "zod";
import { metaSettingsSchema, playerActionType, roleSettingsSchema } from "./types";
import { botDifficulty, botPlaystyle } from "../entities/gameBotSetup";

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
		type: z.literal("CHANGE_SEAT"),
		seatNr: z.number(),
	}).strict(),
	z.object({
		type: z.literal("UPDATE_LOBBY_SETTINGS"),
		metaSettings: metaSettingsSchema.partial(),
		roleSettings: roleSettingsSchema,
	}).strict(),
	z.object({
		type: z.literal("ADD_BOT"),
	}).strict(),
	z.object({
		type: z.literal("CHANGE_BOT_SETTINGS"),
		botId: z.number(),
		difficulty: z.enum(botDifficulty),
		playstyle: z.enum(botPlaystyle),
	}).strict(),
	z.object({
		type: z.literal("KICK_PLAYER"),
		playerId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("SET_READY"),
		ready: z.boolean(),
	}).strict(),
	z.object({
		type: z.literal("REQUEST_GAME_STATE"),
	}).strict(),
	z.object({
		type: z.literal("PLAYER_ACTION"),
		action: z.enum(playerActionType),
		targetPlayerId: z.number().nullable(),
	}).strict(),
	z.object({
		type: z.literal("SEND_GAME_CHAT_MESSAGE"),
		message: z.string(),
	}).strict(),
	z.object({
		type: z.literal("RECOVER_GAME"),
	}).strict(),
	z.object({
		type: z.literal("INVITE_TO_GAME"),
		targetUserId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("SEND_FRIEND_REQUEST"),
		targetUsername: z.string().min(1),
	}).strict(),
	z.object({
		type: z.literal("ACCEPT_FRIEND_REQUEST"),
		userId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("REJECT_FRIEND_REQUEST"),
		userId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("REMOVE_FRIEND"),
		userId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("BLOCK_USER"),
		userId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("UNBLOCK_USER"),
		userId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("CANCEL_FRIEND_REQUEST"),
		userId: z.number(),
	}).strict(),
		z.object({
		type: z.literal("SEND_DIRECT_CHAT_MESSAGE"),
		targetUserId: z.number(),
		message: z.string(),
	}).strict(),
	z.object({
		type: z.literal("EDIT_DIRECT_CHAT_MESSAGE"),
		messageId: z.number(),
		message: z.string(),
	}).strict(),
	z.object({
		type: z.literal("DELETE_DIRECT_CHAT_MESSAGE"),
		messageId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("MARK_DIRECT_CHAT_READ"),
		targetUserId: z.number(),
	}).strict(),
	z.object({
		type: z.literal("CHECK_ONLINE"),
		userIds: z.array(z.number()),
	}).strict(),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;