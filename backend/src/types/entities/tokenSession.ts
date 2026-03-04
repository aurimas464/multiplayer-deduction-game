import { z } from "zod";

export const tokenSessionSchema = z.object({
	id: z.number().int(),
	userId: z.number().int(),
	refreshTokenHash: z.string(),
	refreshExpiresAt: z.coerce.date(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const createTokenSessionSchema = z.object({
	userId: z.number().int(),
	refreshTokenHash: z.string(),
	refreshExpiresAt: z.coerce.date(),
}).strip();

export type TokenSession = z.infer<typeof tokenSessionSchema>;
export type CreateTokenSession = z.infer<typeof createTokenSessionSchema>;