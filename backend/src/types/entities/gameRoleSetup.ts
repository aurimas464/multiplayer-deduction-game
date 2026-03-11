import { z } from "zod";

export const gameRoleSetupSchema = z.object({
	id: z.number().int(),
	gameId: z.number().int(),
	roleId: z.number().int(),
	count: z.number().int().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const createGameRoleSetupSchema = z.object({
	gameId: z.number().int(),
	roleId: z.number().int(),
	count: z.number().int().nullable().optional(),
}).strip();

export type GameRoleSetup = z.infer<typeof gameRoleSetupSchema>;
export type CreateGameRoleSetup = z.infer<typeof createGameRoleSetupSchema>;