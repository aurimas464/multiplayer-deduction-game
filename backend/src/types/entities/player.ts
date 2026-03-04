import { z } from "zod";

export const playerType = ["user", "bot"] as const;

export const playerSchema = z.object({
	id: z.number().int(),
	icon: z.string().nullable(),
	iconEtag: z.string().nullable(),
	type: z.enum(playerType),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const responsePlayerSchema = playerSchema.omit({
	createdAt: true,
	updatedAt: true,
	iconEtag: true,
	type: true,
}).strip();

export type Player = z.infer<typeof playerSchema>;
export type ResponsePlayer = z.infer<typeof responsePlayerSchema>;