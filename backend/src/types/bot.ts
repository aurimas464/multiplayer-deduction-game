import type { LobbyPlayer, PhaseResult, PersonalPhaseResult, PlayerAction, PlayerActionType } from "./websocket/types";
import type { PhaseType } from "./entities/game";

// Without random
export const botDifficultyKeys = ["easy", "normal", "hard"] as const;
export type FinalBotDifficulty = (typeof botDifficultyKeys)[number];
export const botPlaystyleKeys = ["balanced", "aggressive", "passive", "deceptive", "defensive", "chaotic"] as const;
export type FinalBotPlaystyle = (typeof botPlaystyleKeys)[number];

// Playstyle keys
export const botRateLevels = ["low", "medium", "high"] as const;
export type RateLevel = (typeof botRateLevels)[number];
export const botRiskLevels = ["safe", "balanced", "risky"] as const;
export type RiskLevel = (typeof botRiskLevels)[number];

export type BotMemoryPlayer = Pick<LobbyPlayer, "playerId" | "username">;
export type BotRoleMemory = { key: string; alignment: string; weight: number; description: string; nightActions: string[] };

// Playstyle profile
export type BotProfile = {
	talkStyle: { 
		confidence: RateLevel; 
		accusationRate: RateLevel; 
		claimRate: RateLevel; 
		deceptionRate: RateLevel; 
		questionRate: RateLevel; 
	};
	actionStyle: { 
		voteRisk: RiskLevel; 
		nightRisk: RiskLevel; 
		targetPriority: string[]; 
	};
	behavior: string[];
	strategyHints: string[];
};

// Memory structure with ruleset attached
export type BotGameMemory = {
	gameId: number;
	playerId: number;
	name: string;
	profile: BotProfile;
	ownRoleKey: string | null;
	ownAlignment: string | null;
	availableRoles: BotRoleMemory[];
	players: BotMemoryPlayer[];
	phaseHistory: BotPhaseHistoryEntry[];
	decisionHistory: BotDecisionHistoryEntry[];
};

// Phase history entry
export type BotPhaseHistoryEntry = {
	dayNumber: number;
	phase: PhaseType;
	submittedAction: PlayerAction | null;
	publicResult: PhaseResult;
	personalResult: PersonalPhaseResult[];
};

// Decision history entry
export type BotDecisionHistoryEntry = {
	dayNumber: number;
	phase: PhaseType;
	actionType?: string;
	targetPlayerId?: number | null;
	submittedAction?: PlayerAction | null;
	publicResult?: PhaseResult;
	personalResult?: PersonalPhaseResult[];
	message?: string;
	reason: string;
};

// Patch for creating internal profile
export type BotProfilePatch = {
	talkStyle?: Partial<BotProfile["talkStyle"]>;
	actionStyle?: Partial<Pick<BotProfile["actionStyle"], "voteRisk" | "nightRisk">> & { targetPriority?: string[] };
	behavior?: string[];
	strategyHints?: string[];
};

// Options for chat bot configs
export type BotJsonOptions = {
	think?: boolean;
	compactMemory?: boolean;
	includePrivateRole?: boolean;
	temperature?: number;
};

// Choice item for bot
export type BotActionChoice = {
	choiceIndex: number;
	actionType: PlayerActionType;
	label: string;
	requiresTarget: boolean;
};

// Expected result
export type BotChoiceResult = {
	choiceIndex: number;
	targetIndex: number | null;
	reason: string;
};

// Resent Chat messages
export type RecentChatMemoryEntry = {
	playerId: number | null;
	messageType: string;
	name: string;
	message: string;
	dayNumber: number;
	phase: PhaseType;
};
export type ReservedDiscussionMessages = {
	messages: string[];
	updatedAt: number;
};