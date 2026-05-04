import { z } from "zod";

export const botDifficulty = ["random", "easy", "normal", "hard"] as const;
export type BotDifficulty = (typeof botDifficulty)[number];
export const botPlaystyle = ["random", "balanced", "aggressive", "passive", "deceptive", "defensive", "chaotic"] as const;
export type BotPlaystyle = (typeof botPlaystyle)[number];

export const gameBotSetupSchema = z.object({
	gameId: z.number().int(),
	playerId: z.number().int(),
	difficulty: z.enum(botDifficulty),
	playstyle: z.enum(botPlaystyle),
	memoryJson: z.unknown().nullable()
});

export const createGameBotSetupSchema = gameBotSetupSchema.omit({
	difficulty: true,
	playstyle: true,
	memoryJson: true
});

export const patchGameBotSetupSchema = gameBotSetupSchema.omit({
	memoryJson: true
}).partial({
	difficulty: true,
	playstyle: true
});

export type GameBotSetup = z.infer<typeof gameBotSetupSchema>;
export type CreateGameBotSetup = z.infer<typeof createGameBotSetupSchema>;
export type PatchGameBotSetup = z.infer<typeof patchGameBotSetupSchema>;