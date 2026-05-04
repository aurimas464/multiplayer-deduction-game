import { z } from "zod";

export const gameRoleSetupSchema = z.object({
	gameId: z.number().int(),
	roleId: z.number().int(),
	count: z.number().int()
});

export const createGameRoleSetupSchema = gameRoleSetupSchema;

export type GameRoleSetup = z.infer<typeof gameRoleSetupSchema>;
export type CreateGameRoleSetup = z.infer<typeof createGameRoleSetupSchema>;