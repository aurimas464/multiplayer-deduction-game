import { BotModel } from "../repositories/botRepository";
import { GameBotSetupModel } from "../repositories/gameBotSetupRepository";
import type { BotDifficulty, BotPlaystyle } from "../types/entities/gameBotSetup";
import type { PhaseType } from "../types/entities/game";
import type { CreateGameChatMessage, ResponseGameChatMessage } from "../types/entities/gameChatMessage";
import type { Role } from "../types/entities/role";
import type { LobbyPlayer, BotSettings } from "../types/websocket/types";
import type { GameStatePlayer, PersonalPhaseResult, PhaseResult, PlayerAction, PlayerActionType, BotNightActionState } from "../types/websocket/types";
import { botDifficultyKeys, botPlaystyleKeys, BotJsonOptions } from "../types/bot";
import type { BotActionChoice, BotChoiceResult, BotDecisionHistoryEntry, BotGameMemory, BotMemoryPlayer, BotPhaseHistoryEntry, BotProfile, BotProfilePatch, BotRoleMemory, FinalBotDifficulty, FinalBotPlaystyle, RecentChatMemoryEntry, ReservedDiscussionMessages } from "../types/bot";
import type { Bot } from "../types/entities/bot";

const BOT_RULE_BOOK = {
	game: {
		summary: "Hidden-role gothic deduction game with commune, vampire, and neutral roles.",
		phaseOrder: ["day", "voting", "night"],
		firstDayRule: "The first day skips voting and goes directly to night, so do not discuss voting on day one."
	},
	knowledge: {
		allowed: ["own role", "own alignment", "available role keys", "public chat", "public votes if visible", "public eliminations", "own private results", "known vampire allies if vampire"],
		forbidden: ["private results of other players", "server-only state", "roles not available in this game", "invented claims", "invented night results", "invented votes"],
		evidence: ["contradictions", "claim conflicts", "voting behavior", "public eliminations", "own private role results"],
		accusationRule: "Do not accuse without evidence. Do not accuse only because someone is quiet, talkative, or because it is day one.",
		roleInfoRule: "Claim or hint your role only when it gives strategic value: explaining a result, countering a false claim, surviving pressure, or advancing your win condition."
	},
	mustReadBeforeDiscussion: [
		"Speak like a casual player in a lightly Gotham-themed deduction game, not a helper or narrator.",
		"Keep it short, grounded, and about the game.",
		"First day is light chat only: greet, ask a simple table question, or say there is no evidence yet.",
		"Answer direct questions when they are aimed at you.",
		"Use your own findings from personalResult when useful, but do not invent visits, claims, or night activity.",
		"Silence, low activity, vibe, shadows, or imagined private conversations are not evidence.",
		"Claim your role only when it creates strategic value."
	],
	mustReadBeforeVoting: [
		"Vote only when evidence or win condition supports it.",
		"Before voting, consider your own role, alignment, and win condition.",
		"Self-vote can be useful for roles that want to be eliminated by vote, but harmful for roles that need to survive.",
		"Use contradictions, claims, votes, eliminations, and your private results.",
		"If evidence is weak, skip. Do not invent reasons."
	],
	mustReadBeforeNightAction: [
		"Choose only a legal action for your role.",
		"Target living valid non-self players; avoid known vampire allies unless survival requires it.",
		"Use role, win condition, suspicion, claims, eliminations, and previous results.",
		"If no useful legal action exists, skip."
	],
	phases: {
		day: "Discuss, question claims, pressure suspicious players only with evidence, defend yourself, and build cases.",
		voting: "Vote for a living player or skip. Avoid random votes.",
		night: "Special role actions resolve secretly."
	},
	votingGuide: {
		lookFor: ["contradictions", "suspicious claims", "harmful vote behavior", "public elimination results", "own role results"],
		avoid: ["random votes", "eliminated players", "votes based only on activity level", "invented evidence"]
	},
	nightActionGuide: {
		lookFor: ["targets useful to your win condition", "trusted players", "suspicious players", "dangerous claims", "players likely to expose you", "previous results"],
		avoid: ["self targets", "eliminated players", "illegal actions", "random kills", "harmful actions on allies unless necessary"]
	},
	nightResolutionOrder: ["visits", "protection", "jail", "information", "elimination", "conversion", "vampire hunger", "starvation", "priest feedback", "chronicler assignment"],
	winConditions: {
		commune: "Commune wins when no living vampires remain.",
		vampire: "Vampires win when living vampires are equal to or greater than living non-vampires.",
		jester: "Jester wins if eliminated by voting.",
		serialKiller: "Serial Killer wins after personally eliminating at least half of all players.",
		chronicler: "Chronicler wins after correctly guessing at least one quarter of all player roles."
	},
	mechanics: {
		skip: "No special action is performed.",
		eliminate: "Eliminate targets one living non-self player. Protection can block this action.",
		convert: "Convert targets one living non-vampire player and changes them into a vampire. Count can use this once per game.",
		inspect: "Inspect targets one living non-self player and returns good if commune, or bad if vampire or neutral.",
		watch: "Watch targets one living non-self player and returns which players targeted that player during the night.",
		jail: "Jail targets one living non-self player and prevents them from submitting actions while jailed.",
		protect: "Protect targets one living non-self player and blocks elimination against that target during the night.",
		guess: "Guess targets one living non-self player and checks whether they have the Chronicler's assigned role key.",
		vampireHunger: "Each vampire tracks its own missed successful eliminations.",
		bloodbank: "If BloodBank is alive, vampire starvation limit increases from three to five missed cycles.",
		vigilantePenalty: "Vigilante dies if they eliminate a commune player.",
		roleReveal: "Eliminated player roles may or may not be public depending on game settings."
	},
	roles: {
		vampire: {
		description: "Vampire-aligned killer. Can eliminate every second night.",
		nightActions: ["eliminate"],
		strategyHints: [
			"Redirect suspicion away from vampires.",
			"Target trusted commune players or information roles.",
			"Avoid looking coordinated with vampire allies.",
		]},
		bloodBank: {
		description: "Vampire-aligned support killer. Extends vampire starvation tolerance while alive.",
		nightActions: ["eliminate"],
		strategyHints: [
			"Stay alive because your existence helps vampires.",
			"Play less recklessly than regular vampires.",
			"Target players likely to expose vampires.",
		]},
		count: {
		description: "Powerful vampire role. Can eliminate and can convert one target once per game.",
		nightActions: ["eliminate", "convert"],
		strategyHints: [
			"Use conversion on a valuable player likely to survive.",
			"Do not waste conversion on someone likely to be voted out.",
			"Protect vampire allies through discussion.",
		]},
		commoner: {
		description: "Commune role with no night action. Relies on discussion and voting.",
		nightActions: ["skip"],
		strategyHints: [
			"Focus on voting behavior and contradictions.",
			"Pressure suspicious claims only when there is a reason.",
			"Do not pretend to have night results.",
		]},
		visionary: {
		description: "Commune information role. Learns whether a target is good or bad.",
		nightActions: ["inspect"],
		strategyHints: [
			"Inspect suspicious or influential players.",
			"Reveal results only when useful.",
			"Remember bad can mean vampire or neutral.",
		]},
		vigilante: {
		description: "Commune killing role. Dies if they eliminate a commune player.",
		nightActions: ["eliminate"],
		strategyHints: [
			"Shoot only when suspicion is strong.",
			"Do not kill on the first night unless there is unusually strong public evidence.",
			"Prioritize likely vampires.",
		]},
		watchman: {
		description: "Commune information role. Sees who visited the chosen target.",
		nightActions: ["watch"],
		strategyHints: [
			"Watch trusted or likely attacked players.",
			"Use visitor results to pressure suspicious players.",
			"Consider who had reason to visit the target; if the target is dead, that may point toward vampire activity.",
		]},
		jailor: {
		description: "Commune control role. Jails one player, blocking their next action cycle.",
		nightActions: ["jail"],
		strategyHints: [
			"Jail suspicious players.",
			"Use jail to test if night pressure stops.",
			"Do not repeatedly jail obvious commune players.",
		]},
		priest: {
		description: "Commune protection role. Protects one target from elimination.",
		nightActions: ["protect"],
		strategyHints: [
			"Protect likely valuable commune players.",
			"Use attack feedback as evidence.",
			"Avoid predictable protection.",
		]},
		jester: {
		description: "Neutral role. Wins by being eliminated during voting.",
		nightActions: ["skip"],
		strategyHints: [
			"Look suspicious but not obviously like Jester.",
			"Encourage votes on yourself indirectly.",
			"Avoid being killed at night.",
		]},
		serialKiller: {
		description: "Neutral killer. Can eliminate every night and wins by reaching the kill requirement.",
		nightActions: ["eliminate"],
		strategyHints: [
			"Blend in as commune.",
			"Remove players who threaten your survival.",
			"Do not let vampires win too quickly.",
		]},
		chronicler: {
		description: "Neutral guessing role. Receives a role key and guesses which player has it.",
		nightActions: ["guess"],
		strategyHints: [
			"Track claims and behavior.",
			"Ask questions to identify assigned roles.",
			"Only guess among roles that exist in this game.",
		]}
	}
} as const;

const DEFAULT_BOT_PROFILE = {
	talkStyle: { confidence: "medium", accusationRate: "medium", claimRate: "low", deceptionRate: "low", questionRate: "medium" },
	actionStyle: { voteRisk: "balanced", nightRisk: "balanced", targetPriority: ["players with contradictions"] },
	behavior: ["Act like a grounded player in a Gotham-like deduction game.", "Use only known information.", "Keep messages short and game-relevant."],
	strategyHints: [] as string[]
} as const;

const BOT_DIFFICULTY_PATCHES: Record<FinalBotDifficulty, BotProfilePatch> = {
	easy: {
		talkStyle: { confidence: "low", accusationRate: "low", claimRate: "low", questionRate: "medium" },
		actionStyle: { voteRisk: "safe", nightRisk: "safe" },
		behavior: ["Make simple arguments.", "Occasionally miss subtle connections.", "Do not over-optimize decisions."]
	},
	normal: {
		behavior: ["Play reasonably.", "Notice obvious contradictions.", "Do not solve everything perfectly."]
	},
	hard: {
		talkStyle: { confidence: "high", accusationRate: "high", questionRate: "high" },
		behavior: ["Track claims, voting patterns, contradictions, and likely team connections.", "Use previous statements when applying pressure.", "Adapt strategy when new public information appears."]
	}
};

const BOT_PLAYSTYLE_PATCHES: Record<FinalBotPlaystyle, BotProfilePatch> = {
	balanced: {
		behavior: ["Balance pressure, defense, questioning, and cooperation."]
	},
	aggressive: {
		talkStyle: { confidence: "high", accusationRate: "high", questionRate: "medium" },
		actionStyle: { voteRisk: "risky", nightRisk: "risky" },
		behavior: ["Push suspicions early when evidence exists.", "Try to control the vote direction.", "Challenge weak claims directly."]
	},
	passive: {
		talkStyle: { confidence: "low", accusationRate: "low", claimRate: "low", questionRate: "medium" },
		actionStyle: { voteRisk: "safe", nightRisk: "safe" },
		behavior: ["Speak less often.", "Avoid leading votes unless evidence is strong.", "Prefer agreeing, soft suspicion, and simple questions."]
	},
	deceptive: {
		talkStyle: { confidence: "medium", accusationRate: "medium", claimRate: "medium", deceptionRate: "high", questionRate: "medium" },
		actionStyle: { voteRisk: "balanced", nightRisk: "risky" },
		behavior: ["Use misleading but plausible arguments when it helps your win condition.", "Do not contradict known public facts.", "Create believable alternative explanations."]
	},
	defensive: {
		talkStyle: { confidence: "medium", accusationRate: "low", claimRate: "medium", questionRate: "high" },
		actionStyle: { voteRisk: "safe", nightRisk: "balanced" },
		behavior: ["Prioritize self-preservation.", "Deflect suspicion carefully.", "Ask others to explain their accusations."]
	},
	chaotic: {
		talkStyle: { confidence: "medium", accusationRate: "high", claimRate: "medium", deceptionRate: "high" },
		actionStyle: { voteRisk: "risky", nightRisk: "risky" },
		behavior: ["Create uncertainty.", "Change pressure often, but stay believable.", "Avoid becoming obviously random."]
	}
};

const BOT_ALIGNMENT_PATCHES: Record<string, BotProfilePatch> = {
	commune: {
		actionStyle: { targetPriority: ["players defending vampires", "players avoiding useful votes", "players making fake-looking claims"] },
		behavior: ["Help commune identify and eliminate vampires. Share role findings when useful, but remember that doing so can make you a target."]
	},
	vampire: {
		actionStyle: { targetPriority: ["confirmed or trusted commune players", "information roles", "protection roles", "players suspecting vampires"] },
		behavior: ["Protect vampire allies, redirect suspicion without obvious coordination, and pretend to be a normal player."]
	},
	neutral: {
		actionStyle: { targetPriority: ["players blocking your personal win condition", "players who are too trusted", "players likely to expose you"] },
		behavior: ["Prioritize your personal win condition over faction loyalty."]
	}
};

const BOT_ACTION_SYSTEM_MESSAGE = [
	"Return exactly one JSON object with only keys choiceIndex, targetIndex, reason.",
	"Choose by numeric choiceIndex from availableActions.",
	"Choose targets by numeric targetIndex from targets.",
	"Do not return action type names, role names, phase names, player ids, memory, context, rules, players, recentChat, or requiredOutput.",
	"If the choice requires a target, targetIndex must be one of targets[].targetIndex.",
	"If the choice does not require a target, targetIndex must be null.",
	"If unsure, choose skip."
].join(" ");

const BOT_DISCUSSION_SYSTEM_MESSAGE = [
	"Return exactly one JSON object with only keys message and reason.",
	"You are speaking in a lightly Gotham-themed hidden-role deduction game.",
	"Write one short game chat message.",
	"Sound casual and table-focused; a small hint of dark-city mood is enough.",
	"No poetic shadow/secret lines, no monologues, no real-life small talk, no strategy-guide phrasing.",
	"Do not start with Name:, Message:, or your own name followed by a colon.",
	"On day one, do not accuse, pressure, or name a suspect.",
	"Never treat quietness, vibes, being watched, shadows, or imagined conversations as evidence.",
	"Only suspect someone when public results, vote history, direct contradictions, or your own personal findings support it.",
	"If discussionState.deceptionPlan.shouldDeceive is true, you should usually use one deceptive tactic in this message.",
	"Allowed deceptive tactics: a misleading suspicion framing, strategic omission, or a plausible false role hint/claim.",
	"Do not fabricate concrete public mechanics (vote totals, eliminations, revealed roles, or system messages).",
	"If someone claims they eliminated, converted, jailed, protected, inspected, watched, or guessed, ask a short follow-up unless you have more important findings.",
	"If someone asks you a question, answer it directly when you can.",
	"Use your own concrete findings from memory.recentFindings when they are useful, but not every message needs to reveal or discuss information.",
	"If discussionState.chatterPlan.shouldChatter is true and there is no urgent question or claim to answer, you may write harmless table chatter instead of discussing findings.",
	"Harmless chatter can be a brief greeting, uncertainty, checking in with the table, or light gothic mood; it must not accuse, reveal, or invent game facts.",
	"Read discussionState.antiRepeat before writing. Do not reuse exact or near-exact wording from those messages.",
	"If you need to repeat the same game idea, change the sentence structure and add current context.",
	"If memory.recentFindings is empty, either say you have nothing solid or use harmless chatter when chatterPlan allows it.",
	"Do not invent night visits, public actions, claims, or evidence.",
	"Do not pressure someone only because they were quiet.",
	"Day one can be a brief greeting or cautious table-read posture.",
	"Claim or hint your role only when it creates strategic value."
].join(" ");

const MAX_PHASE_HISTORY_ENTRIES = 10;
const MAX_DECISION_HISTORY_ENTRIES = 30;
const MAX_PARALLEL_BOT_REQUESTS = 3;

const MAX_RESERVED_DISCUSSION_PHASES = 50;
const MAX_RESERVED_DISCUSSION_MESSAGES = 20;
const RESERVED_DISCUSSION_TTL_MS = 30 * 60 * 1_000;

const BOT_NIGHT_ACTIONS_BY_ROLE: Record<string, PlayerActionType[]> = {
	vampire: ["eliminate"],
	bloodBank: ["eliminate"],
	count: ["eliminate", "convert"],
	visionary: ["inspect"],
	vigilante: ["eliminate"],
	watchman: ["watch"],
	jailor: ["jail"],
	priest: ["protect"],
	serialKiller: ["eliminate"],
	chronicler: ["guess"]
};

type BotRuleBookMemory = Omit<typeof BOT_RULE_BOOK, "roles"> & {
	roles: Partial<typeof BOT_RULE_BOOK.roles>;
};

class BotService {
	private readonly llamaApiUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434/api/chat";
	private readonly llamaModel = process.env.OLLAMA_CHAT_MODEL?.trim() || "qwen2.5:4b";
	private readonly minimumRemainingRequestMs = 5_000;

	private activeBotRequests = 0;
	// Queue to avoit too many requests at the same time
	private readonly botRequestQueue: Array<() => void> = [];
	// Recent discussions to avoid repetition
	private readonly recentDiscussionMessagesByPhase = new Map<string, ReservedDiscussionMessages>();

	async findBotPlayerById(botPlayerId: number): Promise<Bot | null> {
		return await BotModel.findBotPlayerById(botPlayerId);
	}

	// Before game start, decide what kind of bot you are, baseline knowledge insertion
	async generateBotProfile(gameId: number, botPlayerId: number, botSettings: BotSettings, lobbyPlayers: LobbyPlayer[], roleCatalog: Role[], rolesByPlayerId?: Map<number, Role>): Promise<void> {
		const bot = await BotModel.findBotPlayerById(botPlayerId);
		const settings = botSettings[botPlayerId];
		const configuredDifficulty = settings?.difficulty as BotDifficulty | undefined;
		const configuredPlaystyle = settings?.playstyle as BotPlaystyle | undefined;

		// If random, assign randomly
		const difficulty: FinalBotDifficulty = configuredDifficulty && configuredDifficulty !== "random" ? configuredDifficulty : botDifficultyKeys[Math.floor(Math.random() * botDifficultyKeys.length)];
		const playstyle: FinalBotPlaystyle = configuredPlaystyle && configuredPlaystyle !== "random" ? configuredPlaystyle : botPlaystyleKeys[Math.floor(Math.random() * botPlaystyleKeys.length)];
		
		// Extract own role
		const botName = bot?.name ?? `Bot ${botPlayerId}`;
		const ownRole = rolesByPlayerId?.get(botPlayerId) ?? null;

		// Get available roles, if its not in the available roles, dont talk about such posibilities
		const availableRoles: BotRoleMemory[] = roleCatalog.map((role) => {
			const rule = this.getRoleRule(role.key);
			return { key: role.key, alignment: role.alignment, weight: role.weight, description: rule?.description ?? "Role exists in this game, but no bot rule description is defined.", nightActions: rule ? [...rule.nightActions] : ["skip"] };
		});

		// Remember all players who started the game with you
		const players: BotMemoryPlayer[] = lobbyPlayers.map((player) => ({ playerId: player.playerId, username: player.username }));
		const profile = this.createProfile(difficulty, playstyle, ownRole);

		// Basic setup of memory
		const memory: BotGameMemory = {
			gameId,
			playerId: botPlayerId,
			name: botName,
			profile,
			ownRoleKey: ownRole?.key ?? null,
			ownAlignment: ownRole?.alignment ?? null,
			availableRoles,
			players,
			phaseHistory: [],
			decisionHistory: []
		};

		// Apply to database
		await GameBotSetupModel.upsert({ gameId, playerId: botPlayerId });
		await GameBotSetupModel.changeMemoryJson(gameId, botPlayerId, memory);
	}

	// Append phase results to all bots in the game when a phase rolls over
	async appendPhaseResultsToBots(gameId: number, phase: PhaseType, dayNumber: number, phaseResult: PhaseResult, personalResults: Map<number, PersonalPhaseResult[]>, pendingActions: Map<number, PlayerAction>): Promise<void> {
		const botSetups = await GameBotSetupModel.findByGameId(gameId);

		for (const botSetup of botSetups) {
			const memory = this.ensureMemoryObject(botSetup.memoryJson, gameId, botSetup.playerId);
			const phaseHistory = Array.isArray(memory.phaseHistory) ? [...memory.phaseHistory] : [];

			const submittedAction = pendingActions.get(botSetup.playerId) ?? null;
			const personalResult = personalResults.get(botSetup.playerId) ?? [];
			const phaseHistoryEntry: BotPhaseHistoryEntry = { dayNumber, phase, submittedAction, publicResult: phaseResult, personalResult };
			const decisionHistory = Array.isArray(memory.decisionHistory) ? [...memory.decisionHistory] as BotDecisionHistoryEntry[] : [];

			phaseHistory.push(phaseHistoryEntry);
			memory.phaseHistory = phaseHistory.slice(-MAX_PHASE_HISTORY_ENTRIES);

			for (let index = decisionHistory.length - 1; index >= 0; index--) {
				const entry = decisionHistory[index];

				if (entry.dayNumber !== dayNumber || entry.phase !== phase || entry.actionType === undefined) {
					continue;
				}

				decisionHistory[index] = { ...entry, submittedAction, publicResult: phaseResult, personalResult };
				memory.decisionHistory = decisionHistory.slice(-MAX_DECISION_HISTORY_ENTRIES);
				break;
			}

			await GameBotSetupModel.changeMemoryJson(gameId, botSetup.playerId, memory);
		}
	}

	async chooseVoteAction(gameId: number, playerId: number, dayNumber: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<PlayerAction> {
		// Deadline so the bot knows how long it has to respond
		const deadlineAt = Date.now() + timeoutMs;

		// Generate for bot choices and targets
		const targets = this.createTargetMemory(players, playerId, true, true);
		const targetsForPrompt = targets.map(({ targetIndex, username }) => ({ targetIndex, username }));
		const choices = this.createActionChoices(["vote"]);

		// Ask AI
		const result = await this.askBotWithMemory<{ choiceIndex: number; targetIndex: number | null; reason: string }>(gameId, playerId, BOT_ACTION_SYSTEM_MESSAGE,	{
			timeLimit: {
				timeoutMs,
				minimumRemainingRequestMs: this.minimumRemainingRequestMs,
				instruction: "Only respond if enough time remains. If unsure, return skip quickly."
			},
			phase: "voting",
			availableActions: choices.map(({ choiceIndex, label, requiresTarget }) => ({ choiceIndex, label, requiresTarget })),
			targets: targetsForPrompt,
			recentChat: this.createRecentChatMemory(gameChatMessages)
		}, deadlineAt, { compactMemory: true, think: false } );

		// Parse action
		const resultKeys = this.getObjectKeys(result);
		const voteResult = this.readChoiceResult(result);
		const selectedChoice = voteResult ? choices.find((choice) => choice.choiceIndex === voteResult.choiceIndex) : null;
		let action: PlayerAction = { playerId, type: "skip", targetPlayerId: null };

		// If invalid, log it, used for development
		if (!voteResult || !selectedChoice) {
			this.logBotFailure("Bot vote fell back to skip because no usable response was returned:", { gameId, playerId, dayNumber, timeoutMs });
			if (result) {
				this.logBotFailure("Bot vote response had invalid shape:", { gameId, playerId, dayNumber, reason: "invalid_shape", resultKeys });
			}
		} else if (selectedChoice.actionType === "vote") {
			const target = targets.find((player) => player.targetIndex === voteResult.targetIndex);

			if (target) { action = { playerId, type: "vote", targetPlayerId: target.playerId } } else {
				this.logBotFailure("Bot vote fell back to skip because target was invalid:", { gameId, playerId, dayNumber, result: voteResult, targets });
			}
		} else if (voteResult.targetIndex !== null) {
			this.logBotFailure("Bot vote returned skip with a target; target was ignored:", { gameId, playerId, dayNumber, result: voteResult });
		}

		// Append even if it was unsuccessful, it should know that it skipped
		await this.appendDecision(gameId, playerId, { dayNumber, phase: "voting", actionType: action.type, targetPlayerId: action.targetPlayerId, reason: voteResult?.reason?.trim() || "Fallback, timeout, skipped after queue, or invalid AI response." });
		return action;
	}

	async chooseNightAction(gameId: number, playerId: number, actionState: BotNightActionState, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<PlayerAction> {
		// Deadline so the bot knows how long it has to respond
		const deadlineAt = Date.now() + timeoutMs;
		const hasStrongPublicEvidence = gameChatMessages.some((message) => /\b(inspect(?:ed)?|watch(?:ed)?|saw|result|proof|confirmed|caught|contradict(?:ion|ed|s)?)\b/i.test(message.message));
		
		// Generate for bot choices and targets
		const possibleActions = actionState.roleKey ? BOT_NIGHT_ACTIONS_BY_ROLE[actionState.roleKey] ?? [] : [];
		const actionTypes: PlayerActionType[] = [];

		// More specific rule handling (can be skipped but better not for consistency)
		for (const actionType of possibleActions) {
			switch (actionType) {
				case "eliminate":
					if (actionState.roleKey === "vigilante" && !hasStrongPublicEvidence) continue;
					if (actionState.roleKey === "vampire" || actionState.roleKey === "bloodBank" || actionState.roleKey === "count") {
						if (actionState.dayNumber !== 1 && actionState.vampireMissedEliminationCycles < 1) continue;
					}
					actionTypes.push(actionType);
					break;
				case "convert":
					if (!actionState.hasUsedConvert) {
						actionTypes.push(actionType);
					}
					break;
				case "guess":
					if (actionState.chroniclerCurrentRoleKey !== null) {
						actionTypes.push(actionType);
					}
					break;
				default:
					actionTypes.push(actionType);
					break;
			}
		}

		// Create target memory for the bot
		const targets = this.createTargetMemory(players, playerId, false, false);
		const targetsForPrompt = targets.map(({ targetIndex, username }) => ({ targetIndex, username }));
		const choices = this.createActionChoices(actionTypes);
		const skipAction: PlayerAction = { playerId, type: "skip", targetPlayerId: null };

		// No valid role action or no valid target means the only action is skip (can be skipped but better not for consistency)
		if (actionTypes.length === 0 || targets.length === 0) {
			await this.appendDecision(gameId, playerId, { dayNumber: actionState.dayNumber, phase: "night", actionType: "skip", targetPlayerId: null, reason: actionTypes.length === 0 ? "No legal night action available." : "No valid night targets available." });
			return skipAction;
		}

		// Ask AI
		const result = await this.askBotWithMemory<{ choiceIndex: number; targetIndex: number | null; reason: string }>( gameId, playerId, BOT_ACTION_SYSTEM_MESSAGE, {
			timeLimit: {
				timeoutMs,
				minimumRemainingRequestMs: this.minimumRemainingRequestMs,
				instruction: "Only respond if enough time remains. If unsure, return skip quickly."
			},
			phase: "night",
			availableActions: choices.map(({ choiceIndex, label, requiresTarget }) => ({ choiceIndex, label, requiresTarget })),
			targets: targetsForPrompt,
			chroniclerTargetRole: actionState.chroniclerCurrentRoleKey,
			recentChat: this.createRecentChatMemory(gameChatMessages)
		}, deadlineAt, { compactMemory: true, think: false });

		// Parse results
		let action: PlayerAction = skipAction;
		const resultKeys = this.getObjectKeys(result);
		const nightResult = this.readChoiceResult(result);
		const selectedChoice = nightResult ? choices.find((choice) => choice.choiceIndex === nightResult.choiceIndex) : null;

		// If invalid, log it, used for development
		if (!nightResult || !selectedChoice) {
			this.logBotFailure("Bot night action fell back to skip because no usable response was returned:", { gameId, playerId, dayNumber: actionState.dayNumber, timeoutMs });
			if (result) {
				this.logBotFailure("Bot night action response had invalid shape:", {  gameId, playerId, dayNumber: actionState.dayNumber, reason: "invalid_shape", resultKeys });
			}
		} else if (selectedChoice.actionType === "skip") {
			if (nightResult.targetIndex !== null) {
				this.logBotFailure("Bot night action returned skip with a target; target was ignored:", { gameId, playerId, dayNumber: actionState.dayNumber, result: nightResult });
			}
		} else {
			const target = targets.find((player) => player.targetIndex === nightResult.targetIndex);
			if (target) {
				action = { playerId, type: selectedChoice.actionType, targetPlayerId: target.playerId };
			} else {
				this.logBotFailure("Bot night action fell back to skip because target was invalid:", { gameId, playerId, dayNumber: actionState.dayNumber, actionType: selectedChoice.actionType, result: nightResult, targets });
			}
		}

		// Append even if it was unsuccessful, it should know that it skipped
		await this.appendDecision(gameId, playerId, { dayNumber: actionState.dayNumber, phase: "night", actionType: action.type, targetPlayerId: action.targetPlayerId, reason: nightResult?.reason?.trim() || "Fallback, timeout, skipped after queue, or invalid AI response." });
		return action;
	}

	async createDiscussionMessage(gameId: number, playerId: number, phase: PhaseType, dayNumber: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<CreateGameChatMessage | null> {
		// Deadline so the bot knows how long it has to respond
		const deadlineAt = Date.now() + timeoutMs;

		// Load bot memory before building discussion context
		const botSetup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		const botMemory = this.ensureMemoryObject(botSetup?.memoryJson, gameId, playerId);

		// Check if bot has private results worth mentioning
		const hasRecentFindings = Array.isArray(botMemory.phaseHistory) && botMemory.phaseHistory.some((entry) => {
			const historyEntry = entry as Partial<BotPhaseHistoryEntry>;
			return Array.isArray(historyEntry.personalResult) && historyEntry.personalResult.length > 0;
		});

		const recentChatMemory = this.createRecentChatMemory(gameChatMessages);

		// Track recent bot messages to avoid repeated lines
		const recentBotMessages = this.getRecentMessageTexts(recentChatMemory, (message) => message.messageType === "bot", MAX_RESERVED_DISCUSSION_MESSAGES);
		const recentOwnChatMessages = this.getRecentMessageTexts(recentChatMemory, (message) => message.playerId === playerId && message.messageType === "bot", 8);
		const recentOwnMemoryMessages = this.getRecentDecisionMessages(botMemory, 12);
		const recentOwnMessages = this.combineMessageLists(recentOwnChatMessages, recentOwnMemoryMessages, 16);
		const reservedBotMessages = this.getReservedDiscussionMessages(gameId, phase, dayNumber);
		const antiRepeatMessages = this.combineMessageLists(recentBotMessages, reservedBotMessages, MAX_RESERVED_DISCUSSION_MESSAGES);

		// Get bot name for mention detection
		const ownName = players.find((player) => player.playerId === playerId)?.username ?? "";

		// Prepare visible player list for prompt
		const visiblePlayers = players.map((player) => ({
			playerId: player.playerId,
			username: player.username,
			isEliminated: player.isEliminated
		}));

		// Track who already spoke this phase
		const spokenPlayerIds = Array.from(new Set(gameChatMessages
			.map((message) => message.playerId)
			.filter((id): id is number => id !== null)));

		// Collect recent questions from other players
		const recentQuestions = recentChatMemory
			.filter((message) => message.playerId !== playerId && message.message.includes("?"))
			.slice(-5)
			.map((message) => ({
				playerId: message.playerId,
				name: message.name,
				message: message.message,
				mentionsMe: ownName.length > 0 && message.message.toLowerCase().includes(ownName.toLowerCase())
			}));

		// Collect recent action or result claims from other players
		const recentClaims = recentChatMemory
			.filter((message) => message.playerId !== playerId && /\b(eliminated|converted|jailed|protected|inspected|watched|guessed|attacked)\b/i.test(message.message))
			.slice(-5)
			.map((message) => ({
				playerId: message.playerId,
				name: message.name,
				message: message.message
			}));

		// Read deception behavior from bot profile
		const talkStyle = (botMemory.profile as Partial<BotProfile> | undefined)?.talkStyle as Partial<BotProfile["talkStyle"]> | undefined;
		const deceptionRate = talkStyle?.deceptionRate ?? "low";
		// Convert deception style into random chance
		let deceptionChance = deceptionRate === "high" ? 0.82 : deceptionRate === "medium" ? 0.48 : 0.16;
		// Reduce deception on first day to avoid early baseless accusations
		if (dayNumber === 1 && phase === "day") {
			deceptionChance = Math.min(deceptionChance, 0.2);
		}
		// Prepare deception plan for prompt
		const deceptionPlan = { deceptionRate, deceptionChance, shouldDeceive: Math.random() < deceptionChance };

		// Read chatter behavior from bot profile
		const chatterRate = talkStyle?.questionRate ?? "medium";
		const claimRate = talkStyle?.claimRate ?? "low";
		let chatterChance = chatterRate === "high" ? 0.34 : chatterRate === "medium" ? 0.26 : 0.18;

		if (!hasRecentFindings) {
			chatterChance += 0.18;
		}
		if (claimRate === "high") {
			chatterChance -= 0.08;
		}
		if (recentQuestions.some((question) => question.mentionsMe) || recentClaims.length > 0 || phase === "voting") {
			chatterChance = Math.min(chatterChance, 0.12);
		}
		if (dayNumber === 1 && phase === "day") {
			chatterChance = Math.max(chatterChance, 0.45);
		}

		// Prepare chatter plan for prompt
		const chatterPlan = { chatterRate, chatterChance, shouldChatter: Math.random() < chatterChance };

		// Ask AI
		const result = await this.askBotWithMemory<{ message: string; reason: string }>(gameId, playerId, BOT_DISCUSSION_SYSTEM_MESSAGE, {
			timeLimit: {
				timeoutMs,
				minimumRemainingRequestMs: this.minimumRemainingRequestMs,
				instruction: "Only respond if enough time remains, keep the message short."
			},
			phase,
			dayNumber,
			players: visiblePlayers,
			discussionState: { isFirstDay: dayNumber === 1 && phase === "day", spokenPlayerIds, recentBotMessages, recentQuestions, recentClaims, deceptionPlan, chatterPlan,
				antiRepeat: { recentOwnMessages, recentTableBotMessages: antiRepeatMessages, instruction: "Do not copy these lines. Keep the same meaning only when useful, but use different wording and current game context." },
				goal: dayNumber === 1 && phase === "day"
					? "Light first-day table chat only and greetings. No suspect names, no pressure, no accusations."
					: phase === "voting"
						? "Vote only from true evidence: public results, vote history, direct contradiction, or personal findings. Otherwise say skipping is cleaner."
						: "Answer questions first. If someone made an action claim, ask for target/result details. If memory.recentFindings has entries, share the useful part if it benefits you and your side. If not, say you have nothing solid or use harmless chatter when chatterPlan allows it."
			}
		},  deadlineAt, { compactMemory: true, includePrivateRole: true, temperature: 0.6 });

		// Parse discussion response
		const resultKeys = this.getObjectKeys(result);
		const rawDiscussion = result !== null && typeof result === "object" ? result as { message?: unknown; reason?: unknown } : null;
		const discussionResult = typeof rawDiscussion?.message === "string" ? { message: rawDiscussion.message.trim(), reason: typeof rawDiscussion.reason === "string" ? rawDiscussion.reason.trim() : "" } : null;

		// Log invalid discussion shape
		if (result && !discussionResult) {
			this.logBotFailure("Bot discussion response had invalid shape:", { gameId, playerId, phase, dayNumber, reason: "invalid_shape", resultKeys });
		}

		// Clean generated message before showing it publicly
		let message = (discussionResult?.message ?? "").trim();
		const escapedOwnName = ownName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		message = message.replace(/^(name|message)\s*:\s*/i, "");
		if (escapedOwnName) {
			message = message.replace(new RegExp(`^${escapedOwnName}\\s*:\\s*`, "i"), "");
		}

		// Normalize message for safety checks
		message = message.trim();
		const normalizedMessage = message.toLowerCase();

		// Check if message is too similar to recent bot messages
		const repeatsOwnMessage = recentOwnMessages.some((recentMessage) => {
			return this.areMessagesTooSimilar(recentMessage, normalizedMessage);
		});
		const repeatsTableMessage = antiRepeatMessages.some((recentMessage) => {
			return this.areMessagesTooSimilar(recentMessage, normalizedMessage);
		});

		// Detect suspicious wording that should require evidence
		const namesSuspicion = /\b(suspicious|hiding|cover|vampire|eliminated|killed|moved|visited|avoiding|watch(?:ing|ed)?|not sure what that means|keeping an eye|jump|pressure)\b/.test(normalizedMessage);
		const weakEvidence = /\b(quiet|silence|vibe|shadow|shadows|whisper|whispers|watched|watching|talking to|avoiding the group)\b/.test(normalizedMessage);
		const baselessSuspicion = (dayNumber === 1 && phase === "day" && namesSuspicion) || (!hasRecentFindings && namesSuspicion && weakEvidence);
		const baselessAccusationUsed = Array.isArray(botMemory.decisionHistory) && botMemory.decisionHistory.some((entry) => {
			const decision = entry as Partial<BotDecisionHistoryEntry>;
			return typeof decision.reason === "string" && decision.reason.includes("baseless_accusation");
		});
		let repeatFallbackReason: string | null = null;

		// Keep bot chat varied and evidence-based before it reaches the public table.
		if (!message) {
			this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: !discussionResult ? "no usable response" : "empty message", result: discussionResult });
			return null;
		} else if (repeatsOwnMessage || repeatsTableMessage) {
			const fallbackMessage = this.createNonRepeatingDiscussionFallback(phase, dayNumber, playerId, this.combineMessageLists(recentOwnMessages, antiRepeatMessages, MAX_RESERVED_DISCUSSION_MESSAGES + 8));

			if (!fallbackMessage) {
				this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: repeatsOwnMessage ? "repeated_own_bot_message" : "repeated_table_bot_message", result: discussionResult});

				return null;
			}

			message = fallbackMessage;
			repeatFallbackReason = repeatsOwnMessage ? "fallback_after_repeated_own_bot_message" : "fallback_after_repeated_table_bot_message";
		} else if (baselessSuspicion && baselessAccusationUsed) {
			this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: "baseless_suspicion", result: discussionResult });
			return null;
		}

		this.rememberReservedDiscussionMessage(gameId, phase, dayNumber, message);

		const decisionReason = [discussionResult?.reason.trim() || "Fallback, timeout, skipped after queue, or invalid AI response.", repeatFallbackReason, repeatFallbackReason ? null : baselessSuspicion ? "baseless_accusation" : null]
			.filter((entry): entry is string => Boolean(entry))
			.join(" | ");

		// Save accepted discussion message as a bot decision
		await this.appendDecision(gameId, playerId, { dayNumber, phase, message, reason: decisionReason });

		// Return message object for chat insertion
		return { gameId, playerId, message, dayNumber, phase, messageType: "bot" };
	}

	private async askBotWithMemory<T>(gameId: number, playerId: number, systemMessage: string, payload: Record<string, unknown>, deadlineAt?: number, options: BotJsonOptions = {}): Promise<T | null> {
		const setup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		// Log missing memory setup but continue with fallback memory
		if (!setup) {
			this.logBotFailure("Bot memory was missing; request will use fallback memory object:", { gameId, playerId });
		}

		// Load full memory object
		const memory = this.ensureMemoryObject(setup?.memoryJson, gameId, playerId);
		let requestMemory = memory;

		// Reduce memory size for faster and cheaper bot requests
		if (options.compactMemory) {
			// Get available role keys for compact rulebook creation
			const availableRoleKeys = Array.isArray(memory.availableRoles) ? memory.availableRoles.map((role) => (role as Partial<BotRoleMemory>).key).filter((key): key is string => typeof key === "string") : [];
			// Keep only recent phase history
			const phaseHistory = Array.isArray(memory.phaseHistory) ? (memory.phaseHistory as Partial<BotPhaseHistoryEntry>[]).slice(-5) : [];
			// Keep only recent decision history
			const decisionHistory = Array.isArray(memory.decisionHistory) ? (memory.decisionHistory as Partial<BotDecisionHistoryEntry>[]).slice(-5) : [];
			// Extract recent private results
			const recentFindings = phaseHistory.filter((entry) => Array.isArray(entry.personalResult) && entry.personalResult.length > 0).map((entry) => ({dayNumber: entry.dayNumber, phase: entry.phase, personalResult: entry.personalResult }));

			// Build compact memory payload for AI
			requestMemory = { gameId: memory.gameId, playerId: memory.playerId, name: memory.name, ownRoleKey: options.includePrivateRole === false ? undefined : memory.ownRoleKey,
				ownAlignment: options.includePrivateRole === false ? undefined : memory.ownAlignment,
				phaseHistory: phaseHistory.map((entry) => ({
					dayNumber: entry.dayNumber,
					phase: entry.phase,
					submittedAction: entry.submittedAction,
					publicResult: entry.publicResult
				})),
				recentFindings,
				decisionHistory: decisionHistory.map((entry) => ({
					dayNumber: entry.dayNumber,
					phase: entry.phase,
					actionType: entry.actionType,
					targetPlayerId: entry.targetPlayerId,
					message: entry.message
				})),
				rules: {
					mustReadBeforeDiscussion: BOT_RULE_BOOK.mustReadBeforeDiscussion,
					mustReadBeforeVoting: BOT_RULE_BOOK.mustReadBeforeVoting,
					mustReadBeforeNightAction: BOT_RULE_BOOK.mustReadBeforeNightAction,
					winConditions: BOT_RULE_BOOK.winConditions,
					roles: this.createRuleBookForAvailableRoleKeys(availableRoleKeys).roles
				},
				profile: memory.profile
			};
		}

		// Create Ollama chat messages
		const messages: { role: "system" | "user"; content: string }[] = [
			{ role: "system", content: systemMessage },
			{ role: "user", content: JSON.stringify({ memory: requestMemory, ...payload }) }
		];

		// Queue request if too many bot requests are active
		if (this.activeBotRequests >= MAX_PARALLEL_BOT_REQUESTS) {
			await new Promise<void>((resolve) => {
				this.botRequestQueue.push(resolve);
			});
		}

		// Check remaining phase time before starting request
		const remainingMs = deadlineAt ? deadlineAt - Date.now() : undefined;
		if (remainingMs !== undefined && remainingMs < this.minimumRemainingRequestMs) {
			const next = this.botRequestQueue.shift();
			if (next) {
				next();
			}

			this.logBotFailure("Bot request skipped because too little phase time remained:", {
				remainingMs,
				minimumRemainingRequestMs: this.minimumRemainingRequestMs,
				activeBotRequests: this.activeBotRequests,
				queuedBotRequests: this.botRequestQueue.length
			});

			return null;
		}

		// Mark this bot request as active
		this.activeBotRequests++;

		try {
			// Prepare abort controller for phase deadline timeout
			const controller = new AbortController();
			const timeout = remainingMs && remainingMs > 0 ? setTimeout(() => controller.abort(), remainingMs) : null;

			// Prepare model options
			const requestOptions: Record<string, unknown> = { temperature: options.temperature ?? 0.4 };

			try {
				// Send request to Ollama
				const response = await fetch(this.llamaApiUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify({
						model: this.llamaModel,
						stream: false,
						format: "json",
						think: options.think ?? false,
						messages,
						options: requestOptions
					})
				});

				// Handle failed Ollama response
				if (!response.ok) {
					const body = await response.text().catch(() => "");

					this.logBotFailure("Ollama bot request failed:", { status: response.status, statusText: response.statusText, model: this.llamaModel, body });
					return null;
				}

				// Read Ollama response JSON
				const data = await response.json() as { message?: { content?: string } };
				const content = data.message?.content;

				// Require message content from Ollama
				if (!content) {
					this.logBotFailure("Ollama bot response did not include message content:", { model: this.llamaModel, reason: "missing_content", data });
					return null;
				}

				try {
					// Parse bot JSON response
					return JSON.parse(content) as T;
				} catch (error) {
					this.logBotFailure("Ollama bot response was not valid JSON:", { model: this.llamaModel, reason: "invalid_json", error, content });
					return null;
				}
			} catch (error) {
				// Handle request timeout separately from other request errors
				if (error instanceof DOMException && error.name === "AbortError") {
					this.logBotFailure("Ollama bot request timed out before phase ended", { model: this.llamaModel, reason: "timeout", remainingMs });
				} else {
					this.logBotFailure("Ollama bot request error:", { model: this.llamaModel, reason: "request_error", error});
				}
				return null;
			} finally {
				// Clear timeout after request finishes
				if (timeout) {
					clearTimeout(timeout);
				}
			}
		} finally {
			// Mark request as finished
			this.activeBotRequests--;

			// Start next queued bot request
			const next = this.botRequestQueue.shift();
			if (next) {
				next();
			}
		}
	}

	private async appendDecision(gameId: number, playerId: number, entry: BotDecisionHistoryEntry): Promise<void> {
		const setup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		const memory = this.ensureMemoryObject(setup?.memoryJson, gameId, playerId);
		const decisionHistory = Array.isArray(memory.decisionHistory) ? [...memory.decisionHistory] : [];

		decisionHistory.push(entry);
		memory.decisionHistory = decisionHistory.slice(-MAX_DECISION_HISTORY_ENTRIES);

		await GameBotSetupModel.changeMemoryJson(gameId, playerId, memory);
	}

	private createProfile(difficulty: FinalBotDifficulty, playstyle: FinalBotPlaystyle, role: Role | null): BotProfile {
		const profile: BotProfile = {
			talkStyle: { ...DEFAULT_BOT_PROFILE.talkStyle },
			actionStyle: {
				voteRisk: DEFAULT_BOT_PROFILE.actionStyle.voteRisk,
				nightRisk: DEFAULT_BOT_PROFILE.actionStyle.nightRisk,
				targetPriority: [...DEFAULT_BOT_PROFILE.actionStyle.targetPriority]
			},
			behavior: [...DEFAULT_BOT_PROFILE.behavior],
			strategyHints: [...DEFAULT_BOT_PROFILE.strategyHints]
		};

		this.applyProfilePatch(profile, BOT_DIFFICULTY_PATCHES[difficulty]);
		this.applyProfilePatch(profile, BOT_PLAYSTYLE_PATCHES[playstyle]);

		if (role) {
			this.applyProfilePatch(profile, BOT_ALIGNMENT_PATCHES[role.alignment]);
			this.addListItems(profile.strategyHints, this.getRoleRule(role.key)?.strategyHints);
		}

		return profile;
	}

	private applyProfilePatch(profile: BotProfile, patch: BotProfilePatch | undefined): void {
		if (!patch) return;

		if (patch.talkStyle) {
			profile.talkStyle = { ...profile.talkStyle, ...patch.talkStyle };
		}

		if (patch.actionStyle?.voteRisk) {
			profile.actionStyle.voteRisk = patch.actionStyle.voteRisk;
		}

		if (patch.actionStyle?.nightRisk) {
			profile.actionStyle.nightRisk = patch.actionStyle.nightRisk;
		}

		this.addListItems(profile.actionStyle.targetPriority, patch.actionStyle?.targetPriority);
		this.addListItems(profile.behavior, patch.behavior);
		this.addListItems(profile.strategyHints, patch.strategyHints);
	}

	private addListItems(target: string[], items: readonly string[] | string[] | undefined): void {
		if (!items) return;

		for (const item of items) {
			target.push(item);
		}
	}

	private getRoleRule(roleKey: string): typeof BOT_RULE_BOOK.roles[keyof typeof BOT_RULE_BOOK.roles] | undefined {
		return BOT_RULE_BOOK.roles[roleKey as keyof typeof BOT_RULE_BOOK.roles];
	}

	private createRuleBookForAvailableRoleKeys(availableRoleKeys: string[]): BotRuleBookMemory {
		const allowedRoleKeys = new Set(availableRoleKeys);
		const roles = Object.fromEntries(
			Object.entries(BOT_RULE_BOOK.roles).filter(([roleKey]) => allowedRoleKeys.has(roleKey))
		) as Partial<typeof BOT_RULE_BOOK.roles>;

		return { ...BOT_RULE_BOOK, roles };
	}

	private createTargetMemory(players: GameStatePlayer[], playerId: number, includeSelf: boolean, includeKnownAlly: boolean) {
		return players
			.filter((player) => !player.isEliminated)
			.filter((player) => includeSelf || player.playerId !== playerId)
			.filter((player) => includeKnownAlly || !player.isKnownAlly)
			.map((player, index) => ({ targetIndex: index, playerId: player.playerId, username: player.username }));
	}

	private createActionChoices(actionTypes: PlayerActionType[]): BotActionChoice[] {
		const choices: BotActionChoice[] = [{
			choiceIndex: 0,
			actionType: "skip",
			label: "Skip",
			requiresTarget: false
		}];

		for (const actionType of actionTypes) {
			if (actionType === "skip") continue;

			choices.push({
				choiceIndex: choices.length,
				actionType,
				label: actionType,
				requiresTarget: true
			});
		}

		return choices;
	}

	private readChoiceResult(result: unknown): BotChoiceResult | null {
		if (result === null || typeof result !== "object") return null;

		const raw = result as { choiceIndex?: unknown; targetIndex?: unknown; reason?: unknown };
		const choiceIndex = typeof raw.choiceIndex === "number" && Number.isInteger(raw.choiceIndex)
			? raw.choiceIndex
			: typeof raw.choiceIndex === "string" && /^\d+$/.test(raw.choiceIndex.trim())
				? Number(raw.choiceIndex)
				: null;
		const targetIndex = raw.targetIndex === undefined || raw.targetIndex === null || raw.targetIndex === "null"
			? null
			: typeof raw.targetIndex === "number" && Number.isInteger(raw.targetIndex)
				? raw.targetIndex
				: typeof raw.targetIndex === "string" && /^\d+$/.test(raw.targetIndex.trim())
					? Number(raw.targetIndex)
					: undefined;

		if (choiceIndex === null || targetIndex === undefined) return null;

		return { choiceIndex, targetIndex, reason: typeof raw.reason === "string" ? raw.reason.trim() : "" };
	}

	private getObjectKeys(value: unknown): string[] {
		return value !== null && typeof value === "object" ? Object.keys(value) : [];
	}

	private createRecentChatMemory(gameChatMessages: ResponseGameChatMessage[], limit = 20): RecentChatMemoryEntry[] {
		return gameChatMessages.slice(-limit).map((message) => ({
			playerId: message.playerId,
			messageType: message.messageType,
			name: message.user?.username ?? message.bot?.name ?? "System",
			message: message.message,
			dayNumber: message.dayNumber,
			phase: message.phase
		}));
	}

	private getRecentMessageTexts(recentChat: RecentChatMemoryEntry[], predicate: (message: RecentChatMemoryEntry) => boolean, limit: number): string[] {
		return recentChat
			.filter(predicate)
			.map((message) => message.message.trim())
			.filter(Boolean)
			.slice(-limit);
	}

	private combineMessageLists(left: string[], right: string[], limit: number): string[] {
		const messages: string[] = [];
		const seen = new Set<string>();

		for (const message of [...left, ...right]) {
			const normalizedMessage = message.trim().toLowerCase();

			if (!normalizedMessage || seen.has(normalizedMessage)) {
				continue;
			}

			seen.add(normalizedMessage);
			messages.push(message);
		}

		return messages.slice(-limit);
	}

	private getRecentDecisionMessages(memory: Record<string, unknown>, limit: number): string[] {
		if (!Array.isArray(memory.decisionHistory)) return [];

		return memory.decisionHistory
			.map((entry) => entry as Partial<BotDecisionHistoryEntry>)
			.map((entry) => typeof entry.message === "string" ? entry.message.trim() : "")
			.filter(Boolean)
			.slice(-limit);
	}

	private getReservedDiscussionMessages(gameId: number, phase: PhaseType, dayNumber: number): string[] {
		const key = this.createDiscussionMessageKey(gameId, phase, dayNumber);

		this.pruneReservedDiscussionMessages(gameId, key, Date.now());

		return [...(this.recentDiscussionMessagesByPhase.get(key)?.messages ?? [])];
	}

	private rememberReservedDiscussionMessage(gameId: number, phase: PhaseType, dayNumber: number, message: string): void {
		const key = this.createDiscussionMessageKey(gameId, phase, dayNumber);
		const now = Date.now();
		const messages = this.recentDiscussionMessagesByPhase.get(key)?.messages ?? [];

		messages.push(message);
		this.recentDiscussionMessagesByPhase.set(key, {
			messages: messages.slice(-MAX_RESERVED_DISCUSSION_MESSAGES),
			updatedAt: now
		});
		this.pruneReservedDiscussionMessages(gameId, key, now);
	}

	private createDiscussionMessageKey(gameId: number, phase: PhaseType, dayNumber: number): string {
		return `${gameId}:${dayNumber}:${phase}`;
	}

	private pruneReservedDiscussionMessages(gameId: number, currentKey: string, now: number): void {
		const currentGamePrefix = `${gameId}:`;

		for (const [key, value] of this.recentDiscussionMessagesByPhase) {
			if ((key.startsWith(currentGamePrefix) && key !== currentKey) || now - value.updatedAt > RESERVED_DISCUSSION_TTL_MS) {
				this.recentDiscussionMessagesByPhase.delete(key);
			}
		}

		while (this.recentDiscussionMessagesByPhase.size > MAX_RESERVED_DISCUSSION_PHASES) {
			const oldestKey = this.recentDiscussionMessagesByPhase.keys().next().value;

			if (!oldestKey) {
				break;
			}

			this.recentDiscussionMessagesByPhase.delete(oldestKey);
		}
	}

	private createNonRepeatingDiscussionFallback(phase: PhaseType, dayNumber: number, playerId: number, recentMessages: string[]): string | null {
		const candidates = this.getDiscussionFallbackCandidates(phase, dayNumber);
		const startIndex = candidates.length === 0 ? 0 : playerId % candidates.length;

		for (let offset = 0; offset < candidates.length; offset++) {
			const candidate = candidates[(startIndex + offset) % candidates.length];
			const isRepeated = recentMessages.some((recentMessage) => this.areMessagesTooSimilar(recentMessage, candidate));

			if (!isRepeated) {
				return candidate;
			}
		}

		return null;
	}

	private getDiscussionFallbackCandidates(phase: PhaseType, dayNumber: number): string[] {
		if (dayNumber === 1 && phase === "day") {
			return [
				"I'll hold names until something real shows up.",
				"Hello everyone, how are you all this fine day?",
				"First daylight, Let's just get a read on the table.",
				"No case from me yet. Let's wait for real evidence.",
				"Good luck tonight everyone, may the odds be ever in your favour.",
				"Let's see what happens."
			];
		}

		if (phase === "voting") {
			return [
				"I'm not sold enough to push a vote.",
				"I'd rather skip than make a random guess.",
				"Case is too thin for my vote.",
				"I need a contradiction, not just a hunch.",
				"I don't have a clean vote here.",
				"Unless someone has proof, I'm leaning skip."
			];
		}

		return [
            "I want evidence before naming someone.",
			"Any result claims we can actually compare?",
			"Let's keep this tied to results, not noise.",
			"I want a real link before I point.",
			"Nothing firm enough from my side yet.",
			"If someone has something, now would be a good time to say it."
		];
	}

	private areMessagesTooSimilar(left: string, right: string): boolean {
		const leftWords = this.normalizeDiscussionMessage(left);
		const rightWords = this.normalizeDiscussionMessage(right);

		if (leftWords.length === 0 || rightWords.length === 0) return false;
		if (leftWords.join(" ") === rightWords.join(" ")) return true;
		if (Math.min(leftWords.length, rightWords.length) < 4) return false;

		const leftText = leftWords.join(" ");
		const rightText = rightWords.join(" ");

		if (Math.min(leftWords.length, rightWords.length) >= 5 && (leftText.includes(rightText) || rightText.includes(leftText))) {
			return true;
		}

		const leftSet = new Set(leftWords);
		const rightSet = new Set(rightWords);
		let shared = 0;

		for (const word of leftSet) {
			if (rightSet.has(word)) {
				shared++;
			}
		}

		const wordSimilarity = shared / Math.max(leftSet.size, rightSet.size);
		const phraseSimilarity = this.calculatePhraseSimilarity(leftWords, rightWords);

		return wordSimilarity >= 0.5 && phraseSimilarity >= 0.5;
	}

	private normalizeDiscussionMessage(message: string): string[] {
		return message.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2);
	}

	private calculatePhraseSimilarity(leftWords: string[], rightWords: string[]): number {
		const leftPhrases = this.createWordPairs(leftWords);
		const rightPhrases = this.createWordPairs(rightWords);

		if (leftPhrases.size === 0 || rightPhrases.size === 0) return 0;

		let shared = 0;

		for (const phrase of leftPhrases) {
			if (rightPhrases.has(phrase)) {
				shared++;
			}
		}

		return shared / Math.max(leftPhrases.size, rightPhrases.size);
	}

	private createWordPairs(words: string[]): Set<string> {
		const pairs = new Set<string>();

		for (let index = 0; index < words.length - 1; index++) {
			pairs.add(`${words[index]} ${words[index + 1]}`);
		}

		return pairs;
	}

	private ensureMemoryObject(memoryJson: unknown, gameId: number, playerId: number): Record<string, unknown> {
		if (memoryJson !== null && typeof memoryJson === "object" && !Array.isArray(memoryJson)) {
			return { ...(memoryJson as Record<string, unknown>) };
		}

		return { gameId, playerId };
	}

	private logBotFailure(message: string, details?: Record<string, unknown>): void {
		if (process.env.NODE_ENV === "production") return;
		console.error(message, details);
	}
}

export default new BotService();
