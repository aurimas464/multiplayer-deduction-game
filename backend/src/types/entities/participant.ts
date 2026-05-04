import { z } from "zod";

export const participantSchema = z.object({
	gameId: z.number().int(),
	playerId: z.number().int(),
	roleId: z.number().int().nullable(),
	seatNr: z.number().int(),
	didWin: z.boolean().nullable(),
	isAlive: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createParticipantSchema = participantSchema.omit({
	roleId: true,
	didWin: true,
	isAlive: true,
	createdAt: true,
	updatedAt: true
});

export const patchParticipantSchema = participantSchema.omit({
	createdAt: true,
	updatedAt: true
}).partial({
	roleId: true,
	seatNr: true,
	didWin: true,
	isAlive: true
});

export type Participant = z.infer<typeof participantSchema>;
export type CreateParticipant = z.infer<typeof createParticipantSchema>;
export type PatchParticipant = z.infer<typeof patchParticipantSchema>;