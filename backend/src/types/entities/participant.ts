import { z } from "zod";

export const participantSchema = z.object({
	gameId: z.number().int(),
	playerId: z.number().int(),
	seatNr: z.number().int(),
	roleId: z.number().int().nullable().optional(),
}).strip();

export type Participant = z.infer<typeof participantSchema>;