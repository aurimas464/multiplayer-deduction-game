import { z } from "zod";
import { responsePlayerSchema } from "./player";

export const botSchema = z.object({
	id: z.number().int(),
	name: z.string()
});

export const createBotSchema = botSchema.omit({
	id: true
});

export const responseBotSchema = botSchema.extend({
	player: responsePlayerSchema
});

export type Bot = z.infer<typeof botSchema>;
export type BotWithPlayer = z.infer<typeof responseBotSchema>;
export type CreateBot = z.infer<typeof createBotSchema>;

export type ResponseBot = z.infer<typeof responseBotSchema>;
