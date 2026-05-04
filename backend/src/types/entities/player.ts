import { z } from "zod";

export const playerType = ["user", "bot"] as const;
export type PlayerType = (typeof playerType)[number];

export const playerSchema = z.object({
	id: z.number().int(),
	type: z.enum(playerType),
	icon: z.string().nullable(),
	iconEtag: z.string().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createPlayerSchema = playerSchema.omit({
	id: true,
	icon: true,
	iconEtag: true,
	createdAt: true,
	updatedAt: true
});

export const responsePlayerSchema = playerSchema.omit({
	type: true,
	icon: true,
	createdAt: true,
	updatedAt: true
});

export type Player = z.infer<typeof playerSchema>;
export type CreatePlayer = z.infer<typeof createPlayerSchema>;

export type ResponsePlayer = z.infer<typeof responsePlayerSchema>;