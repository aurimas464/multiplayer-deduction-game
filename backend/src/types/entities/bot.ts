import { z } from "zod";

export const botSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export type Bot = z.infer<typeof botSchema>;