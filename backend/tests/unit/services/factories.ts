import type { Game } from "../../../src/types/entities/game";
import type { ResponseGameChatMessage } from "../../../src/types/entities/gameChatMessage";
import type { Participant } from "../../../src/types/entities/participant";
import type { Player } from "../../../src/types/entities/player";
import type { Role } from "../../../src/types/entities/role";
import type { UserWithPlayer } from "../../../src/types/entities/user";
import type { GameStatePlayer, LobbyPlayer, PlayerState } from "../../../src/types/websocket/types";

export const now = new Date("2026-01-01T00:00:00.000Z");

type PlayerStateOverrides = {
	runtime?: Partial<PlayerState["runtime"]>;
	phase?: Partial<PlayerState["phase"]>;
};

type TestUserWithPlayer = Omit<UserWithPlayer, "player"> & { player: Player };

export const makeGame = (overrides: Partial<Game> = {}): Game => ({
	id: 1,
	gameCode: "ABCDEF",
	status: "lobby",
	phase: null,
	winnerAlignment: null,
	dayNumber: 1,
	maxPlayers: 8,
	minPlayers: 5,
	daySeconds: 60,
	votingSeconds: 45,
	nightSeconds: 45,
	tieBehavior: "no_one_dies",
	voteCountVisibility: "end",
	roleDistributionMode: "exact",
	anonymousVoting: false,
	roleRevealOnDeath: true,
	createdAt: now,
	updatedAt: now,
	...overrides
});

export const makeParticipant = (overrides: Partial<Participant> = {}): Participant => ({
	gameId: 1,
	playerId: 1,
	roleId: null,
	seatNr: 1,
	didWin: null,
	isAlive: true,
	createdAt: now,
	updatedAt: now,
	...overrides
});

export const makeRole = (overrides: Partial<Role> = {}): Role => ({
	id: 1,
	key: "commoner",
	alignment: "commune",
	weight: 1,
	...overrides
});

export const makePlayerState = (overrides: PlayerStateOverrides = {}): PlayerState => ({
	runtime: {
		isEliminated: false,
		vampireMissedEliminationCycles: 0,
		hasUsedConvert: false,
		isConverted: false,
		serialKillerEliminationCount: 0,
		chroniclerCorrectGuessCount: 0,
		chroniclerCurrentRoleKey: null,
		chroniclerGuessedRoleKeys: new Set<string>(),
		...overrides.runtime
	},
	phase: {
		visitedByPlayerIds: new Set<number>(),
		isJailed: false,
		isProtected: false,
		wasProtectedFromElimination: false,
		...overrides.phase
	}
});

export const makeGameStatePlayer = (overrides: Partial<GameStatePlayer> = {}): GameStatePlayer => ({
	playerId: 1,
	type: "user",
	username: "Player",
	iconEtag: "etag",
	seatNr: 1,
	isEliminated: false,
	isKnownAlly: false,
	...overrides
});

export const makeLobbyPlayer = (overrides: Partial<LobbyPlayer> = {}): LobbyPlayer => ({
	playerId: 1,
	type: "bot",
	username: "Bot",
	iconEtag: "etag",
	isReady: false,
	isOnline: true,
	seatNr: 1,
	...overrides
});

export const makePlayer = (overrides: Partial<Player> = {}): Player => ({
	id: 10,
	type: "user",
	icon: null,
	iconEtag: "etag",
	createdAt: now,
	updatedAt: now,
	...overrides
});

export const makeUserWithPlayer = (overrides: Partial<Omit<TestUserWithPlayer, "player">> & { player?: Partial<Player> } = {}): TestUserWithPlayer => {
	const { player, ...userOverrides } = overrides;

	return {
	id: 1,
	username: "Aurimas",
	email: "aurimas@example.com",
	password: "hash",
	theme: "dark",
	colorTheme: "red",
	language: "en",
	createdAt: now,
	updatedAt: now,
	player: makePlayer(player),
	...userOverrides
	};
};

export const makeGameMessage = (overrides: Partial<ResponseGameChatMessage> = {}): ResponseGameChatMessage => ({
	id: 1,
	gameId: 1,
	playerId: 1,
	message: "hello",
	messageType: "player",
	dayNumber: 1,
	phase: "day",
	createdAt: now,
	user: {
		id: 1,
		username: "Aurimas",
		player: { id: 1, iconEtag: "etag" }
	},
	bot: null,
	...overrides
});
