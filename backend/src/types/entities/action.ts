import { z } from "zod";
import { phaseType } from "./game";

export const actionSchema = z.object({
	id: z.number().int(),
	gameId: z.number().int(),
	actorParticipantId: z.number().int(),
	targetParticipantId: z.number().int().nullable(),
	actionKey: z.string(),
	dayNumber: z.number().int(),
	phase: z.enum(phaseType),
	createdAt: z.coerce.date()
});

export const createActionSchema = actionSchema.omit({
	id: true,
	createdAt: true
});

export type Action = z.infer<typeof actionSchema>;
export type CreateAction = z.infer<typeof createActionSchema>;