import { z } from "zod";
import { participantSchema } from "./participant";

export const GameStatus = ["lobby", "in_progress", "finished", "cancelled"] as const;
export const PhaseType = ["day", "voting", "night"] as const;
export const TieBehavior = ["no_one_dies", "random_among_tied", "revote"] as const;
export const VoteCountVisibility = ["never", "end", "live"] as const;
export const RoleDistributionMode = ["exact", "weighted_random"] as const;

export const gameSchema = z.object({
	id: z.number().int(),
	gameCode: z.string(),
	status: z.enum(GameStatus),

	maxPlayers: z.number().int(),
	minPlayers: z.number().int(),

	phaseType: z.enum(PhaseType).nullable(),
	daySeconds: z.number().int(),
	votingSeconds: z.number().int(),
	nightSeconds: z.number().int(),

	tieBehavior: z.enum(TieBehavior),
	voteCountVisibility: z.enum(VoteCountVisibility),
	anonymousVoting: z.boolean(),
	roleRevealOnDeath: z.boolean(),
	roleDistributionMode: z.enum(RoleDistributionMode),

	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const gameWithParticipantsSchema = gameSchema.extend({
	participants: z.array(
		participantSchema.pick({
			playerId: true,
			seatNr: true,
			roleId: true,
		})
	),
}).strip();

export const responseLobbyGameSchema = gameSchema.extend({
	participants: z.array(
		participantSchema.pick({
			playerId: true,
			seatNr: true,
			roleId: true,
		})
	),
}).strip();

export type Game = z.infer<typeof gameSchema>;
export type GameWithParticipants = z.infer<typeof gameWithParticipantsSchema>;
export type ResponseLobbyGame = z.infer<typeof responseLobbyGameSchema>;