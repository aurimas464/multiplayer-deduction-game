import { z } from "zod";
import { seatSchema } from "./seat";

export const GameStatus = ["lobby", "in_progress", "finished", "cancelled"] as const;

export const gameSchema = z.object({
	id: z.number().int(),
	gameCode: z.string(),
	status: z.enum(GameStatus),
	maxPlayers: z.number().int(),
	minPlayers: z.number().int(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const gameWithSeatsSchema = gameSchema.extend({
	seats: z.array(
		seatSchema.pick({
			playerId: true,
			number: true,
		})
	),
}).strip();

export const responseLobbyGameSchema = gameSchema.extend({
	seats: z.array(
		seatSchema.pick({
			playerId: true,
			number: true,
		})
	),
}).strip();

export type Game = z.infer<typeof gameSchema>;
export type GameWithSeats = z.infer<typeof gameWithSeatsSchema>;
export type ResponseLobbyGame = z.infer<typeof responseLobbyGameSchema>;