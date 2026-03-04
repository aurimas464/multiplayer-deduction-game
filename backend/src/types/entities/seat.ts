import { z } from "zod";

export const seatSchema = z.object({
	gameId: z.number().int(),
	playerId: z.number().int(),
	number: z.number().int(),
}).strip();

export type Seat = z.infer<typeof seatSchema>;