import { z } from "zod";

export const sessionSchema = z.object({
	id: z.number().int(),
	userId: z.number().int(),
	refreshTokenHash: z.string(),
	refreshExpiresAt: z.coerce.date(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createSessionSchema = sessionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type Session = z.infer<typeof sessionSchema>;
export type CreateSession = z.infer<typeof createSessionSchema>;