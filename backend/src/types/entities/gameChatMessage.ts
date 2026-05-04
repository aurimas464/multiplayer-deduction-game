import { z } from "zod";
import { responseUserSchema } from "./user";
import { responseBotSchema } from "./bot";

export const gameChatMessageType = ["player", "system", "bot"] as const;
export type GameChatMessageType = (typeof gameChatMessageType)[number];
export const phaseType = ["day", "voting", "night"] as const;
export type PhaseType = (typeof phaseType)[number];

export const gameChatMessageSchema = z.object({
	id: z.number().int(),
	gameId: z.number().int(),
	playerId: z.number().int().nullable(),
	message: z.string(),
	messageType: z.enum(gameChatMessageType),
	dayNumber: z.number().int(),
	phase: z.enum(phaseType),
	createdAt: z.coerce.date()
});

export const createGameChatMessageSchema = gameChatMessageSchema.omit({
	id: true,
	createdAt: true
});

export const responseGameChatMessageSchema = gameChatMessageSchema.extend({
	user: responseUserSchema.nullable(),
	bot: responseBotSchema.nullable()
});

export type GameChatMessage = z.infer<typeof gameChatMessageSchema>;
export type CreateGameChatMessage = z.infer<typeof createGameChatMessageSchema>;

export type ResponseGameChatMessage = z.infer<typeof responseGameChatMessageSchema>;
