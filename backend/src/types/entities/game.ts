import { z } from "zod";
import { seatSchema } from "./seat";

export const GameStatus = ["lobby", "in_progress", "finished", "cancelled"] as const;
export const TieBehavior = ["no_one_dies", "random_among_tied", "revote"] as const;
export const VoteCountVisibility = ["never", "end", "live"] as const;

export const gameSchema = z.object({
	id: z.number().int(),
	gameCode: z.string(),
	status: z.enum(GameStatus),

	maxPlayers: z.number().int(),
	minPlayers: z.number().int(),

	daySeconds: z.number().int(),
	votingSeconds: z.number().int(),
	nightSeconds: z.number().int(),

	tieBehavior: z.enum(TieBehavior),
	voteCountVisibility: z.enum(VoteCountVisibility),
	anonymousVoting: z.boolean(),
	roleRevealOnDeath: z.boolean(),

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