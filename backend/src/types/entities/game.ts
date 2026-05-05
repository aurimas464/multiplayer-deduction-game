import { z } from "zod";
import { gameChatMessageSchema } from "./gameChatMessage";
import { responseUserSchema } from "./user";
import { responseBotSchema } from "./bot";
import { roleAlignment } from "./role";
import type { Participant } from "./participant";
import type { PlayerType } from "./player";
import type { BotDifficulty, BotPlaystyle } from "./gameBotSetup";

export const gameStatus = ["lobby", "starting", "in_progress", "finished", "cancelled"] as const;
export type GameStatus = (typeof gameStatus)[number];
export const phaseType = ["day", "voting", "night"] as const;
export type PhaseType = (typeof phaseType)[number];
export const tieBehavior = ["no_one_dies", "random_among_tied"] as const;
export type TieBehavior = (typeof tieBehavior)[number];
export const voteCountVisibility = ["never", "end"] as const;
export type VoteCountVisibility = (typeof voteCountVisibility)[number];
export const roleDistributionMode = ["exact", "weighted_random"] as const;
export type RoleDistributionMode = (typeof roleDistributionMode)[number];

export const gameSchema = z.object({
	id: z.number().int(),
	gameCode: z.string(),
	status: z.enum(gameStatus),
	phase: z.enum(phaseType).nullable(),
	winnerAlignment: z.enum(roleAlignment).nullable(),
	dayNumber: z.number().int(),
	maxPlayers: z.number().int(),
	minPlayers: z.number().int(),
	daySeconds: z.number().int(),
	votingSeconds: z.number().int(),
	nightSeconds: z.number().int(),
	tieBehavior: z.enum(tieBehavior),
	voteCountVisibility: z.enum(voteCountVisibility),
	roleDistributionMode: z.enum(roleDistributionMode),
	anonymousVoting: z.boolean(),
	roleRevealOnDeath: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createGameSchema = gameSchema.omit({
	id: true,
	status: true,
	phase: true,
	dayNumber: true,
	winnerAlignment: true,
	maxPlayers: true,
	minPlayers: true,
	daySeconds: true,
	votingSeconds: true,
	nightSeconds: true,
	tieBehavior: true,
	voteCountVisibility: true,
	roleDistributionMode: true,
	anonymousVoting: true,
	roleRevealOnDeath: true,
	createdAt: true,
	updatedAt: true
});

export const patchGameSchema = gameSchema.omit({
	status: true,
	phase: true,
	dayNumber: true,
	winnerAlignment: true,
	createdAt: true,
	updatedAt: true,
	gameCode: true
}).partial({
	maxPlayers: true,
	minPlayers: true,
	daySeconds: true,
	votingSeconds: true,
	nightSeconds: true,
	tieBehavior: true,
	voteCountVisibility: true,
	roleDistributionMode: true,
	anonymousVoting: true,
	roleRevealOnDeath: true
});

export const gameChatMessageItemSchema = gameSchema.omit({
	phase: true,
	dayNumber: true,
	winnerAlignment: true,
	maxPlayers: true,
	minPlayers: true,
	daySeconds: true,
	votingSeconds: true,
	nightSeconds: true,
	tieBehavior: true,
	voteCountVisibility: true,
	roleDistributionMode: true,
	anonymousVoting: true,
	roleRevealOnDeath: true,
	createdAt: true,
	updatedAt: true
}).extend({
	lastMessage: gameChatMessageSchema.omit({
		id: true,
		gameId: true
	}).nullable(),
	user: responseUserSchema.nullable(),
	bot: responseBotSchema.nullable()
});

export type Game = z.infer<typeof gameSchema>;
export type CreateGame = z.infer<typeof createGameSchema>;
export type PatchGame = z.infer<typeof patchGameSchema>;

export type GameChatMessageItem = z.infer<typeof gameChatMessageItemSchema>;

export type GameSessionSnapshotParticipant = Participant & {
	username: string;
	iconEtag: string;
	type: PlayerType;
};

export type GameSessionSnapshot = {
	game: Game;
	participants: GameSessionSnapshotParticipant[];
	roleSettings: Record<number, number>;
	botSettings: Record<number, { difficulty: BotDifficulty; playstyle: BotPlaystyle }>;
};
