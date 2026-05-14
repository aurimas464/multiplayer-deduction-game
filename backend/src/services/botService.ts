import { BotModel } from "../repositories/botRepository";
import { GameBotSetupModel } from "../repositories/gameBotSetupRepository";
import type { BotDifficulty, BotPlaystyle } from "../types/entities/gameBotSetup";
import type { PhaseType } from "../types/entities/game";
import type { CreateGameChatMessage, ResponseGameChatMessage } from "../types/entities/gameChatMessage";
import type { Role } from "../types/entities/role";
import type { LobbyPlayer, BotSettings } from "../types/websocket/types";
import type { GameStatePlayer, PersonalPhaseResult, PhaseResult, PlayerAction, PlayerActionType, BotNightActionState } from "../types/websocket/types";
import { botDifficultyKeys, botPlaystyleKeys, botRateLevels, botRiskLevels } from "../types/bot";
import type { BotActionChoice, BotActionPlan, BotChoiceResult, BotDecisionHistoryEntry, BotDiscussionPlanContext, BotDiscussionPlans, BotGameMemory, BotJsonOptions, BotMemoryPlayer, BotPhaseHistoryEntry, BotProfile, BotProfilePatch, BotRoleMemory, FinalBotDifficulty, FinalBotPlaystyle, RateLevel, RecentChatMemoryEntry, ReservedDiscussionMessages, RiskLevel } from "../types/bot";
import type { Bot } from "../types/entities/bot";

// Compact rule book
const BOT_RULE_BOOK = {
	action: {
		timeLimitInstruction: "Only respond if enough time remains. If unsure, return skip quickly.",
		voting: [
			"Vote only when evidence or win condition supports it.",
			"Before voting, consider your own role, alignment, and win condition.",
			"Self-vote can be useful for roles that want to be eliminated by vote, but harmful for roles that need to survive.",
			"Use contradictions, claims, votes, eliminations, and your private results.",
			"If evidence is weak, skip. Do not invent reasons."
		],
		night: [
			"Choose only a legal action for your role.",
			"Target living valid non-self players; avoid known vampire allies unless survival requires it.",
			"Use role, win condition, suspicion, claims, eliminations, and previous results.",
			"If no useful legal action exists, skip."
		]
	},
	discussion: {
		timeLimitInstruction: "Only respond if enough time remains, keep the message short.",
		antiRepeatInstruction: "Do not copy these lines. Keep the same meaning only when useful, but use different wording and current game context.",
		mustRead: [
			"Speak like a casual player in a lightly Gotham-themed deduction game, not a helper or narrator.",
			"Keep it short, grounded, and about the game.",
			"First day is light chat only: greet, ask a simple table question, or say there is no evidence yet.",
			"Answer direct questions when they are aimed at you.",
			"Use your own findings from personalResult when useful, but do not invent visits, claims, or night activity.",
			"Silence, low activity, vibe, shadows, or imagined private conversations are not evidence.",
			"Claim your role only when it creates strategic value."
		],
		goals: {
			firstDay: "Light first-day table chat only and greetings. No suspect names, no pressure, no accusations. Your goal, bring variety to the table.",
			voting: "Use voting discussion to act on available evidence. If public results, vote history, direct contradictions, recentClaims, or memory.recentFindings point to a player, name that player and explain the reason. Only say skipping is cleaner when none of those sources gives a usable reason.",
			regular: "Answer questions first. If someone made an action claim, ask for target/result details. If memory.recentFindings has entries, share the useful part if it benefits you and your side. If not, say you have nothing solid or use harmless chatter when chatterPlan allows it."
		}
	},
	winConditions: {
		commune: "Commune wins when no living vampires remain.",
		vampire: "Vampires win when living vampires are equal to or greater than living non-vampires.",
		jester: "Jester wins if eliminated by voting.",
		serialKiller: "Serial Killer wins after personally eliminating at least half of all players.",
		chronicler: "Chronicler wins after correctly guessing at least one quarter of all player roles."
	},
	roles: {
		vampire: {
			description: "Vampire-aligned killer. Can eliminate every second night.",
			nightActions: ["eliminate"],
			strategyHints: [
				"Redirect suspicion away from vampires.",
				"Target trusted commune players or information roles.",
				"Avoid looking coordinated with vampire allies."
			]
		},
		bloodBank: {
			description: "Vampire-aligned support killer. Extends vampire starvation tolerance while alive.",
			nightActions: ["eliminate"],
			strategyHints: [
				"Stay alive because your existence helps vampires.",
				"Play less recklessly than regular vampires.",
				"Target players likely to expose vampires."
			]
		},
		count: {
			description: "Powerful vampire role. Can eliminate and can convert one target once per game.",
			nightActions: ["eliminate", "convert"],
			strategyHints: [
				"Use conversion on a valuable player likely to survive.",
				"Do not waste conversion on someone likely to be voted out.",
				"Protect vampire allies through discussion."
			]
		},
		commoner: {
			description: "Commune role with no night action. Relies on discussion and voting.",
			nightActions: ["skip"],
			strategyHints: [
				"Focus on voting patterns and contradictions.",
				"Pressure suspicious claims only when there is a reason.",
				"Do not pretend to have night results."
			]
		},
		visionary: {
			description: "Commune information role. Learns whether a target is good or bad.",
			nightActions: ["inspect"],
			strategyHints: [
				"Inspect suspicious or influential players.",
				"Reveal results only when useful.",
				"Remember bad can mean vampire or neutral."
			]
		},
		vigilante: {
			description: "Commune killing role. Dies if they eliminate a commune player.",
			nightActions: ["eliminate"],
			strategyHints: [
				"Be careful with low-information kills because wrong eliminations can punish you.",
				"Use private findings, claim conflicts, or strong table contradictions when choosing a target.",
				"Prioritize likely vampires."
			]
		},
		watchman: {
			description: "Commune information role. Sees who visited the chosen target.",
			nightActions: ["watch"],
			strategyHints: [
				"Watch trusted or likely attacked players.",
				"Use visitor results to pressure suspicious players.",
				"Consider who had reason to visit the target; if the target is dead, that may point toward vampire activity."
			]
		},
		jailor: {
			description: "Commune control role. Jails one player, blocking their next action cycle.",
			nightActions: ["jail"],
			strategyHints: [
				"Jail suspicious players.",
				"Use jail to test if night pressure stops.",
				"Do not repeatedly jail obvious commune players."
			]
		},
		priest: {
			description: "Commune protection role. Protects one target from elimination.",
			nightActions: ["protect"],
			strategyHints: [
				"Protect likely valuable commune players.",
				"Use attack feedback as evidence.",
				"Avoid predictable protection."
			]
		},
		jester: {
			description: "Neutral role. Wins by being eliminated during voting.",
			nightActions: ["skip"],
			strategyHints: [
				"Look suspicious but not obviously like Jester.",
				"Encourage votes on yourself indirectly.",
				"Avoid being killed at night."
			]
		},
		serialKiller: {
			description: "Neutral killer. Can eliminate every night and wins by reaching the kill requirement.",
			nightActions: ["eliminate"],
			strategyHints: [
				"Blend in as commune.",
				"Remove players who threaten your survival.",
				"Do not let vampires win too quickly."
			]
		},
		chronicler: {
			description: "Neutral guessing role. Receives a role key and guesses which player has it.",
			nightActions: ["guess"],
			strategyHints: [
				"Track claims and voting patterns.",
				"Ask questions to identify assigned roles.",
				"Only guess among roles that exist in this game."
			]
		}
	}
} as const;

const DEFAULT_BOT_PROFILE = {
	talkStyle: { confidence: "medium", accusationRate: "medium", claimRate: "low", deceptionRate: "low", questionRate: "medium" },
	actionStyle: { voteRisk: "balanced", nightRisk: "balanced", targetPriority: ["players with contradictions"] }
} as const;

// Difficulty changes
const BOT_DIFFICULTY_PATCHES: Record<FinalBotDifficulty, BotProfilePatch> = {
	easy: {
		talkStyle: { confidence: "low", accusationRate: "low", claimRate: "low", questionRate: "medium" },
		actionStyle: { voteRisk: "safe", nightRisk: "safe" }
	},
	normal: {},
	hard: {
		talkStyle: { confidence: "high", accusationRate: "high", questionRate: "high" }
	}
};

// Playstyles
const BOT_PLAYSTYLE_PATCHES: Record<FinalBotPlaystyle, BotProfilePatch> = {
	balanced: {},
	aggressive: {
		talkStyle: { confidence: "high", accusationRate: "high", questionRate: "medium" },
		actionStyle: { voteRisk: "risky", nightRisk: "risky" }
	},
	passive: {
		talkStyle: { confidence: "low", accusationRate: "low", claimRate: "low", questionRate: "medium" },
		actionStyle: { voteRisk: "safe", nightRisk: "safe" }
	},
	deceptive: {
		talkStyle: { confidence: "medium", accusationRate: "medium", claimRate: "medium", deceptionRate: "high", questionRate: "medium" },
		actionStyle: { voteRisk: "balanced", nightRisk: "risky" }
	},
	defensive: {
		talkStyle: { confidence: "medium", accusationRate: "low", claimRate: "medium", questionRate: "high" },
		actionStyle: { voteRisk: "safe", nightRisk: "balanced" }
	},
	chaotic: {
		talkStyle: { confidence: "medium", accusationRate: "high", claimRate: "medium", deceptionRate: "high" },
		actionStyle: { voteRisk: "risky", nightRisk: "risky" }
	}
};

// Alignment affects target priorities, while legal actions are still checked later by the game state
const BOT_ALIGNMENT_PATCHES: Record<string, BotProfilePatch> = {
	commune: {
		actionStyle: { targetPriority: ["players defending vampires", "players avoiding useful votes", "players making fake-looking claims"] }
	},
	vampire: {
		actionStyle: { targetPriority: ["confirmed or trusted commune players", "information roles", "protection roles", "players suspecting vampires"] }
	},
	neutral: {
		actionStyle: { targetPriority: ["players blocking your personal win condition", "players who are too trusted", "players likely to expose you"] }
	}
};

// Action prompts use numbered choices so the model cannot invent action names or hidden identifiers
const BOT_ACTION_SYSTEM_MESSAGE = [
	"Return exactly one JSON object with only keys choiceIndex, targetIndex, reason.",
	"Use numeric choiceIndex from availableActions and numeric targetIndex from targets; use null when no target is required.",
	"Choose using actionPlan, memory.rules, memory.recentFindings, memory.phaseHistory, memory.decisionHistory, recentChat, and the current phase.",
	"Use only known information from memory and payload. If unsure, choose skip."
].join(" ");

// Discussion prompts have style and safety instructions
const BOT_DISCUSSION_SYSTEM_MESSAGE = [
	"Return exactly one JSON object with only keys message and reason.",
	"Write one short in-game chat message as this bot, following memory.rules and discussionState.",
	"Use memory.recentFindings, memory.phaseHistory, memory.decisionHistory, recentChat, recentQuestions, and recentClaims when relevant.",
	"Use only known facts or private findings; do not invent actions, visits, claims, evidence, vote totals, eliminations, or role reveals.",
	"Keep day one light: no suspect names, pressure, or accusations.",
	"During voting, do not say there is no evidence if memory.recentFindings, recentClaims, vote history, or public results give a usable reason.",
	"When accusing or pressuring a player, mention that player's name and tie it to known evidence.",
	"Do not write vague accusations like someone, people, or this table.",
	"Answer direct questions or action claims when useful; otherwise follow discussionState.goal.",
	"Do not repeat lines listed in discussionState.antiRepeat, and do not start with a name label.",
	"Keep the light Gotham mood subtle and table-focused."
].join(" ");

const MAX_PHASE_HISTORY_ENTRIES = 10;
const MAX_DECISION_HISTORY_ENTRIES = 30;
const MAX_PARALLEL_BOT_REQUESTS = 3;

const MAX_RESERVED_DISCUSSION_PHASES = 50;
const MAX_RESERVED_DISCUSSION_MESSAGES = 20;
const RESERVED_DISCUSSION_TTL_MS = 30 * 60 * 1_000;

// Static role-to-action map
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
	private readonly llamaApiUrl = this.normalizeOllamaChatUrl(process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434");
	private readonly llamaModel = process.env.OLLAMA_CHAT_MODEL?.trim() || "qwen2.5:4b";
	private readonly llamaApiKey = process.env.OLLAMA_API_KEY?.trim() || "";
	private readonly minimumRemainingRequestMs = 5_000;

	private activeBotRequests = 0;
	// Ollama calls are throttled so several bots do not block the event loop with simultaneous long requests
	private readonly botRequestQueue: Array<() => void> = [];
	// Tracks accepted and reserved bot lines per phase to reduce repeated AI phrasing
	private readonly recentDiscussionMessagesByPhase = new Map<string, ReservedDiscussionMessages>();

	async findBotPlayerById(botPlayerId: number): Promise<Bot | null> {
		return await BotModel.findBotPlayerById(botPlayerId);
	}

	// Builds the long-lived bot memory once roles are assigned at game start
	async generateBotProfile(gameId: number, botPlayerId: number, botSettings: BotSettings, lobbyPlayers: LobbyPlayer[], roleCatalog: Role[], rolesByPlayerId?: Map<number, Role>): Promise<void> {
		const bot = await BotModel.findBotPlayerById(botPlayerId);
		const settings = botSettings[botPlayerId];
		const configuredDifficulty = settings?.difficulty as BotDifficulty | undefined;
		const configuredPlaystyle = settings?.playstyle as BotPlaystyle | undefined;

		// Random lobby settings are resolved once so the bot stays consistent throughout the game
		const difficulty: FinalBotDifficulty = configuredDifficulty && configuredDifficulty !== "random" ? configuredDifficulty : botDifficultyKeys[Math.floor(Math.random() * botDifficultyKeys.length)];
		const playstyle: FinalBotPlaystyle = configuredPlaystyle && configuredPlaystyle !== "random" ? configuredPlaystyle : botPlaystyleKeys[Math.floor(Math.random() * botPlaystyleKeys.length)];
		
		// Extract own role
		const botName = bot?.name ?? `Bot ${botPlayerId}`;
		const ownRole = rolesByPlayerId?.get(botPlayerId) ?? null;

		// Only roles present in the current game are stored, preventing bots from discussing impossible roles
		const availableRoles: BotRoleMemory[] = roleCatalog.map((role) => {
			const rule = this.getRoleRule(role.key);
			return { key: role.key, alignment: role.alignment, weight: role.weight, description: rule?.description ?? "Role exists in this game, but no bot rule description is defined.", nightActions: rule ? [...rule.nightActions] : ["skip"] };
		});

		const players: BotMemoryPlayer[] = lobbyPlayers.map((player) => ({ playerId: player.playerId, username: player.username }));
		const profile = this.createProfile(difficulty, playstyle, ownRole);

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

		await GameBotSetupModel.upsert({ gameId, playerId: botPlayerId });
		await GameBotSetupModel.changeMemoryJson(gameId, botPlayerId, memory);
	}

	// Phase results become bot memory after resolution, so future prompts can use real outcomes
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
		const deadlineAt = Date.now() + timeoutMs;
		const botSetup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		const botMemory = this.ensureMemoryObject(botSetup?.memoryJson, gameId, playerId);

		// Targets use temporary indexes so the model does not need database ids in its response
		const targets = this.createTargetMemory(players, playerId, true, true);
		const targetsForPrompt = targets.map(({ targetIndex, username }) => ({ targetIndex, username }));

		// Based on choices and profile decide the plan for request
		const choices = this.createActionChoices(["vote"]);
		const actionPlan = this.createActionPlan(botMemory.profile, "voting");

		// Ask AI
		const result = await this.askBotWithMemory<{ choiceIndex: number; targetIndex: number | null; reason: string }>(gameId, playerId, BOT_ACTION_SYSTEM_MESSAGE, {
			timeLimit: { timeoutMs, minimumRemainingRequestMs: this.minimumRemainingRequestMs, instruction: BOT_RULE_BOOK.action.timeLimitInstruction },
			phase: "voting",
			availableActions: choices.map(({ choiceIndex, label, requiresTarget }) => ({ choiceIndex, label, requiresTarget })),
			targets: targetsForPrompt,
			actionPlan,
			recentChat: this.createRecentChatMemory(gameChatMessages)
		}, deadlineAt, { compactMemory: true, think: false }, botMemory);

		// Validate response
		const resultKeys = this.getObjectKeys(result);
		const voteResult = this.readChoiceResult(result);
		const selectedChoice = voteResult ? choices.find((choice) => choice.choiceIndex === voteResult.choiceIndex) : null;
		let action: PlayerAction = { playerId, type: "skip", targetPlayerId: null };

		// Log bad responses in development
		if (!voteResult || !selectedChoice) {
			this.logBotFailure("Bot vote fell back to skip because no usable response was returned:", { gameId, playerId, dayNumber, timeoutMs });
			if (result) {
				this.logBotFailure("Bot vote response had invalid shape:", { gameId, playerId, dayNumber, reason: "invalid_shape", resultKeys });
			}
		} else if (selectedChoice.actionType === "vote") {
			const target = targets.find((player) => player.targetIndex === voteResult.targetIndex);

			if (target) {
				action = { playerId, type: "vote", targetPlayerId: target.playerId };
			} else {
				this.logBotFailure("Bot vote fell back to skip because target was invalid:", { gameId, playerId, dayNumber, result: voteResult, targets });
			}
		} else if (voteResult.targetIndex !== null) {
			this.logBotFailure("Bot vote returned skip with a target; target was ignored:", { gameId, playerId, dayNumber, result: voteResult });
		}

		// Decisions are stored even after fallback so later prompts know the bot tried or skipped
		await this.appendDecision(gameId, playerId, { dayNumber, phase: "voting", actionType: action.type, targetPlayerId: action.targetPlayerId, reason: voteResult?.reason?.trim() || "Fallback, timeout, skipped after queue, or invalid AI response." });
		return action;
	}

	async chooseNightAction(gameId: number, playerId: number, actionState: BotNightActionState, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<PlayerAction> {
		const deadlineAt = Date.now() + timeoutMs;
		const botSetup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		const botMemory = this.ensureMemoryObject(botSetup?.memoryJson, gameId, playerId);
		
		// Find bots possible action
		const possibleActions = actionState.roleKey ? BOT_NIGHT_ACTIONS_BY_ROLE[actionState.roleKey] ?? [] : [];
		const actionTypes: PlayerActionType[] = [];

		// Server-side gates keep one-use and cooldown-blocked role actions out of the prompt
		for (const actionType of possibleActions) {
			switch (actionType) {
				case "eliminate":
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

		// Targets use temporary indexes so the model does not need database ids in its response
		const targets = this.createTargetMemory(players, playerId, false, false);
		const targetsForPrompt = targets.map(({ targetIndex, username }) => ({ targetIndex, username }));
		const choices = this.createActionChoices(actionTypes);

		// Based on choices and profile decide the plan for request
		const skipAction: PlayerAction = { playerId, type: "skip", targetPlayerId: null };
		const actionPlan = this.createActionPlan(botMemory.profile, "night");

		// Avoid calling the model when the only legal server outcome is skip
		if (actionTypes.length === 0 || targets.length === 0) {
			await this.appendDecision(gameId, playerId, { dayNumber: actionState.dayNumber, phase: "night", actionType: "skip", targetPlayerId: null, reason: actionTypes.length === 0 ? "No legal night action available." : "No valid night targets available." });
			return skipAction;
		}

		// Ask AI
		const result = await this.askBotWithMemory<{ choiceIndex: number; targetIndex: number | null; reason: string }>(gameId, playerId, BOT_ACTION_SYSTEM_MESSAGE, {
			timeLimit: { timeoutMs, minimumRemainingRequestMs: this.minimumRemainingRequestMs, instruction: BOT_RULE_BOOK.action.timeLimitInstruction },
			phase: "night",
			availableActions: choices.map(({ choiceIndex, label, requiresTarget }) => ({ choiceIndex, label, requiresTarget })),
			targets: targetsForPrompt,
			actionPlan,
			chroniclerTargetRole: actionState.chroniclerCurrentRoleKey,
			recentChat: this.createRecentChatMemory(gameChatMessages)
		}, deadlineAt, { compactMemory: true, think: false }, botMemory);

		// Validate response
		let action: PlayerAction = skipAction;
		const resultKeys = this.getObjectKeys(result);
		const nightResult = this.readChoiceResult(result);
		const selectedChoice = nightResult ? choices.find((choice) => choice.choiceIndex === nightResult.choiceIndex) : null;

		// Log bad responses in development
		if (!nightResult || !selectedChoice) {
			this.logBotFailure("Bot night action fell back to skip because no usable response was returned:", { gameId, playerId, dayNumber: actionState.dayNumber, timeoutMs });
			if (result) {
				this.logBotFailure("Bot night action response had invalid shape:", { gameId, playerId, dayNumber: actionState.dayNumber, reason: "invalid_shape", resultKeys });
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

		// Decisions are stored even after fallback so later prompts know the bot tried or skipped
		await this.appendDecision(gameId, playerId, { dayNumber: actionState.dayNumber, phase: "night", actionType: action.type, targetPlayerId: action.targetPlayerId, reason: nightResult?.reason?.trim() || "Fallback, timeout, skipped after queue, or invalid AI response." });
		return action;
	}

	async createDiscussionMessage(gameId: number, playerId: number, phase: PhaseType, dayNumber: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<CreateGameChatMessage | null> {
		const deadlineAt = Date.now() + timeoutMs;
		const botSetup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		const botMemory = this.ensureMemoryObject(botSetup?.memoryJson, gameId, playerId);

		// Get recent data
		const hasRecentFindings = this.hasRecentFindings(botMemory);
		const recentChatMemory = this.createRecentChatMemory(gameChatMessages);

		// Anti-repeat context combines public chat, own memory, and reserved lines from concurrent bots
		const recentBotMessages = this.getRecentMessageTexts(recentChatMemory, (message) => message.messageType === "bot", MAX_RESERVED_DISCUSSION_MESSAGES);
		const recentOwnChatMessages = this.getRecentMessageTexts(recentChatMemory, (message) => message.playerId === playerId && message.messageType === "bot", 8);
		const recentOwnMemoryMessages = this.getRecentDecisionMessages(botMemory, 12);
		const recentOwnMessages = this.combineMessageLists(recentOwnChatMessages, recentOwnMemoryMessages, 16);
		const reservedBotMessages = this.getReservedDiscussionMessages(gameId, phase, dayNumber);
		const antiRepeatMessages = this.combineMessageLists(recentBotMessages, reservedBotMessages, MAX_RESERVED_DISCUSSION_MESSAGES);

		// Find yourself
		const ownName = players.find((player) => player.playerId === playerId)?.username ?? "";
		// Public player data is enough for discussion
		const visiblePlayers = players.map((player) => ({ playerId: player.playerId, username: player.username, isEliminated: player.isEliminated}));
		// Get recent players who talked
		const spokenPlayerIds = Array.from(new Set(gameChatMessages.map((message) => message.playerId).filter((id): id is number => id !== null)));
		// Mentions get special handling so the bot is more likely to answer direct questions.
		const recentQuestions = recentChatMemory.filter((message) => message.playerId !== playerId && message.message.includes("?")).slice(-5).map((message) => ({ playerId: message.playerId, name: message.name, message: message.message, mentionsMe: ownName.length > 0 && message.message.toLowerCase().includes(ownName.toLowerCase())}));
		// Claims are separated from normal chat because they often require direct follow-up questions.
		const recentClaims = recentChatMemory.filter((message) => message.playerId !== playerId && /\b(eliminated|converted|jailed|protected|inspected|watched|guessed|attacked)\b/i.test(message.message)).slice(-5).map((message) => ({ playerId: message.playerId, name: message.name, message: message.message }));
		const hasDiscussionEvidence = hasRecentFindings || recentClaims.length > 0 || this.hasRecentPublicResults(botMemory);

		// Profile settings become concrete yes/no plans before the model sees the prompt.
		const discussionPlans = this.createDiscussionPlans(botMemory.profile, {
			phase,
			dayNumber,
			hasRecentFindings: hasDiscussionEvidence,
			hasMentionedQuestion: recentQuestions.some((question) => question.mentionsMe),
			hasRecentClaims: recentClaims.length > 0
		});

		// Ask AI
		const result = await this.askBotWithMemory<{ message: string; reason: string }>(gameId, playerId, BOT_DISCUSSION_SYSTEM_MESSAGE, {
			timeLimit: { timeoutMs, minimumRemainingRequestMs: this.minimumRemainingRequestMs, instruction: BOT_RULE_BOOK.discussion.timeLimitInstruction },
			phase,
			dayNumber,
			players: visiblePlayers,
			recentChat: recentChatMemory,
			discussionState: {
				isFirstDay: dayNumber === 1 && phase === "day",
				spokenPlayerIds,
				recentBotMessages,
				recentQuestions,
				recentClaims,
				...discussionPlans,
				antiRepeat: { recentOwnMessages, recentTableBotMessages: antiRepeatMessages, instruction: BOT_RULE_BOOK.discussion.antiRepeatInstruction },
				goal: this.getDiscussionGoal(phase, dayNumber)
			}
		}, deadlineAt, { compactMemory: true, includePrivateRole: true, temperature: 0.6 }, botMemory);

		// Validate response
		const resultKeys = this.getObjectKeys(result);
		const rawDiscussion = result !== null && typeof result === "object" ? result as { message?: unknown; reason?: unknown } : null;
		const discussionResult = typeof rawDiscussion?.message === "string" ? { message: rawDiscussion.message.trim(), reason: typeof rawDiscussion.reason === "string" ? rawDiscussion.reason.trim() : "" } : null;
		if (result && !discussionResult) {
			this.logBotFailure("Bot discussion response had invalid shape:", { gameId, playerId, phase, dayNumber, reason: "invalid_shape", resultKeys });
		}

		// Remove model-added labels before the message reaches public chat
		let message = (discussionResult?.message ?? "").trim();
		const escapedOwnName = ownName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		message = message.replace(/^(name|message)\s*:\s*/i, "");
		if (escapedOwnName) {
			message = message.replace(new RegExp(`^${escapedOwnName}\\s*:\\s*`, "i"), "");
		}

		message = message.trim();
		const normalizedMessage = message.toLowerCase();

		const repeatsOwnMessage = recentOwnMessages.some((recentMessage) => {
			return this.areMessagesTooSimilar(recentMessage, normalizedMessage);
		});
		const repeatsTableMessage = antiRepeatMessages.some((recentMessage) => {
			return this.areMessagesTooSimilar(recentMessage, normalizedMessage);
		});

		// Suspicion phrasing is allowed, but weak or repeated baseless suspicion is filtered before insert
		// Keep bot chat varied and evidence-based before it reaches the public table
		const namesSuspicion = /\b(suspicious|hiding|cover|vampire|eliminated|killed|moved|visited|avoiding|watch(?:ing|ed)?|not sure what that means|keeping an eye|jump|pressure)\b/.test(normalizedMessage);
		const weakEvidence = /\b(quiet|silence|vibe|shadow|shadows|whisper|whispers|watched|watching|talking to|avoiding the group)\b/.test(normalizedMessage);
		const baselessSuspicion = (dayNumber === 1 && phase === "day" && namesSuspicion) || (!hasDiscussionEvidence && namesSuspicion && weakEvidence);
		const baselessAccusationUsed = Array.isArray(botMemory.decisionHistory) && botMemory.decisionHistory.some((entry) => {
			const decision = entry as Partial<BotDecisionHistoryEntry>;
			return typeof decision.reason === "string" && decision.reason.includes("baseless_accusation");
		});
		const allowImperfectMessage = this.rollChance(0.25);
		let repeatFallbackReason: string | null = null;

		// Log bad responses in development
		if (!message) {
			this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: !discussionResult ? "no usable response" : "empty message", result: discussionResult });
			return null;
		} else if (repeatsOwnMessage || repeatsTableMessage) {
			const fallbackMessage = this.createNonRepeatingDiscussionFallback(phase, dayNumber, playerId, this.combineMessageLists(recentOwnMessages, antiRepeatMessages, MAX_RESERVED_DISCUSSION_MESSAGES + 8));
			if (!fallbackMessage) {
				this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: repeatsOwnMessage ? "repeated_own_bot_message" : "repeated_table_bot_message", result: discussionResult });

				return null;
			}
			message = fallbackMessage;
			repeatFallbackReason = repeatsOwnMessage ? "fallback_after_repeated_own_bot_message" : "fallback_after_repeated_table_bot_message";
		} else if (baselessSuspicion && baselessAccusationUsed && !allowImperfectMessage) {
			this.logBotFailure("Bot discussion skipped message:", { gameId, playerId, phase, dayNumber, reason: "baseless_suspicion", result: discussionResult });
			return null;
		}

		// Appeand text and respon to bot and return
		this.rememberReservedDiscussionMessage(gameId, phase, dayNumber, message);
		const decisionReason = [discussionResult?.reason.trim() || "Fallback, timeout, skipped after queue, or invalid AI response.", repeatFallbackReason, repeatFallbackReason ? null : baselessSuspicion ? "baseless_accusation" : null].filter((entry): entry is string => Boolean(entry)).join(" | ");
		await this.appendDecision(gameId, playerId, { dayNumber, phase, message, reason: decisionReason });
		return { gameId, playerId, message, dayNumber, phase, messageType: "bot" };
	}

	private async askBotWithMemory<T>(gameId: number, playerId: number, systemMessage: string, payload: Record<string, unknown>, deadlineAt?: number, options: BotJsonOptions = {}, prefetchedMemory?: Record<string, unknown>): Promise<T | null> {
		const memory = prefetchedMemory ?? await this.loadBotMemory(gameId, playerId);
		const requestMemory = this.createRequestMemory(memory, options);

		const messages: { role: "system" | "user"; content: string }[] = [
			{ role: "system", content: systemMessage },
			{ role: "user", content: JSON.stringify({ memory: requestMemory, ...payload }) }
		];

		// Local LLM calls can be slow, so requests are queued instead of launched all at once
		if (this.activeBotRequests >= MAX_PARALLEL_BOT_REQUESTS) {
			await new Promise<void>((resolve) => {
				this.botRequestQueue.push(resolve);
			});
		}

		// A late model response is worse than a skipped bot action
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

		this.activeBotRequests++;

		try {
			const controller = new AbortController();
			const timeout = remainingMs && remainingMs > 0 ? setTimeout(() => controller.abort(), remainingMs) : null;
			const requestOptions: Record<string, unknown> = { temperature: options.temperature ?? 0.4 };

			try {
				const headers: Record<string, string> = { "Content-Type": "application/json" };
				if (this.llamaApiKey) {
					headers.Authorization = `Bearer ${this.llamaApiKey}`;
				}

				const response = await fetch(this.llamaApiUrl, {
					method: "POST",
					headers,
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

				if (!response.ok) {
					const body = await response.text().catch(() => "");

					this.logBotFailure("Ollama bot request failed:", { status: response.status, statusText: response.statusText, model: this.llamaModel, body });
					return null;
				}

				const data = await response.json() as { message?: { content?: string } };
				const content = data.message?.content;

				if (!content) {
					this.logBotFailure("Ollama bot response did not include message content:", { model: this.llamaModel, reason: "missing_content", data });
					return null;
				}

				try {
					return JSON.parse(content) as T;
				} catch (error) {
					this.logBotFailure("Ollama bot response was not valid JSON:", { model: this.llamaModel, reason: "invalid_json", error, content });
					return null;
				}
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					this.logBotFailure("Ollama bot request timed out before phase ended", { model: this.llamaModel, reason: "timeout", remainingMs });
				} else {
					this.logBotFailure("Ollama bot request error:", { model: this.llamaModel, reason: "request_error", error});
				}
				return null;
			} finally {
				if (timeout) {
					clearTimeout(timeout);
				}
			}
		} finally {
			this.activeBotRequests--;

			// Release exactly one queued bot request after this request finishes or fails
			const next = this.botRequestQueue.shift();
			if (next) {
				next();
			}
		}
	}

	private createRequestMemory(memory: Record<string, unknown>, options: BotJsonOptions): Record<string, unknown> {
		if (!options.compactMemory) {
			return memory;
		}

		// Compact memory keeps prompts bounded while preserving recent context, findings, and rules
		const availableRoleKeys = Array.isArray(memory.availableRoles) ? memory.availableRoles.map((role) => (role as Partial<BotRoleMemory>).key).filter((key): key is string => typeof key === "string") : [];
		const phaseHistory = Array.isArray(memory.phaseHistory) ? (memory.phaseHistory as Partial<BotPhaseHistoryEntry>[]).slice(-5) : [];
		const decisionHistory = Array.isArray(memory.decisionHistory) ? (memory.decisionHistory as Partial<BotDecisionHistoryEntry>[]).slice(-5) : [];
		const recentFindings = phaseHistory
			.filter((entry) => Array.isArray(entry.personalResult) && entry.personalResult.length > 0)
			.map((entry) => ({ dayNumber: entry.dayNumber, phase: entry.phase, personalResult: entry.personalResult }));

		return {
			gameId: memory.gameId,
			playerId: memory.playerId,
			name: memory.name,
			ownRoleKey: options.includePrivateRole === false ? undefined : memory.ownRoleKey,
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
			rules: this.createRuleBookForAvailableRoleKeys(availableRoleKeys)
		};
	}

	private async appendDecision(gameId: number, playerId: number, entry: BotDecisionHistoryEntry): Promise<void> {
		const setup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);
		if (!setup) return;

		// Decision history is bounded because it is sent back into later model prompts
		const memory = this.ensureMemoryObject(setup?.memoryJson, gameId, playerId);
		const decisionHistory = Array.isArray(memory.decisionHistory) ? [...memory.decisionHistory] : [];

		decisionHistory.push(entry);
		memory.decisionHistory = decisionHistory.slice(-MAX_DECISION_HISTORY_ENTRIES);

		await GameBotSetupModel.changeMemoryJson(gameId, playerId, memory);
	}

	private async loadBotMemory(gameId: number, playerId: number): Promise<Record<string, unknown>> {
		const setup = await GameBotSetupModel.findByGameIdAndPlayerId(gameId, playerId);

		if (!setup) {
			this.logBotFailure("Bot memory was missing; request will use fallback memory object:", { gameId, playerId });
		}

		return this.ensureMemoryObject(setup?.memoryJson, gameId, playerId);
	}

	private createProfile(difficulty: FinalBotDifficulty, playstyle: FinalBotPlaystyle, role: Role | null): BotProfile {
		const profile: BotProfile = {
			talkStyle: { ...DEFAULT_BOT_PROFILE.talkStyle },
			actionStyle: {
				voteRisk: DEFAULT_BOT_PROFILE.actionStyle.voteRisk,
				nightRisk: DEFAULT_BOT_PROFILE.actionStyle.nightRisk,
				targetPriority: [...DEFAULT_BOT_PROFILE.actionStyle.targetPriority]
			}
		};

		// Patch order gives lobby playstyle the final say over difficulty, then alignment adds target priorities
		this.applyProfilePatch(profile, BOT_DIFFICULTY_PATCHES[difficulty]);
		this.applyProfilePatch(profile, BOT_PLAYSTYLE_PATCHES[playstyle]);

		if (role) {
			this.applyProfilePatch(profile, BOT_ALIGNMENT_PATCHES[role.alignment]);
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
	}

	private addListItems(target: string[], items: readonly string[] | string[] | undefined): void {
		if (!items) return;

		for (const item of items) {
			const cleanItem = item.trim();

			// Target priorities are additive, but duplicated hints only make prompts noisier
			if (cleanItem && !target.some((targetItem) => targetItem.toLowerCase() === cleanItem.toLowerCase())) {
				target.push(cleanItem);
			}
		}
	}

	private hasRecentFindings(memory: Record<string, unknown>): boolean {
		return Array.isArray(memory.phaseHistory) && memory.phaseHistory.some((entry) => {
			const historyEntry = entry as Partial<BotPhaseHistoryEntry>;
			return Array.isArray(historyEntry.personalResult) && historyEntry.personalResult.length > 0;
		});
	}

	private hasRecentPublicResults(memory: Record<string, unknown>): boolean {
		if (!Array.isArray(memory.phaseHistory)) return false;

		return memory.phaseHistory.some((entry) => {
			const phaseResult = (entry as Partial<BotPhaseHistoryEntry>).publicResult;

			return Boolean(phaseResult && ((phaseResult.eliminated?.length ?? 0) > 0 || (phaseResult.votes?.length ?? 0) > 0));
		});
	}

	private createDiscussionPlans(profileJson: unknown, context: BotDiscussionPlanContext): BotDiscussionPlans {
		const talkStyle = this.readBotProfile(profileJson).talkStyle;
		const confidenceRate = talkStyle.confidence;
		const deceptionRate = talkStyle.deceptionRate;
		const chatterRate = talkStyle.questionRate;
		const accusationRate = talkStyle.accusationRate;
		const claimRate = talkStyle.claimRate;
		const confidenceMultiplier = confidenceRate === "high" ? 1.15 : confidenceRate === "medium" ? 1 : 0.75;

		let deceptionChance = deceptionRate === "high" ? 0.82 : deceptionRate === "medium" ? 0.48 : 0.16;
		let chatterChance = chatterRate === "high" ? 0.34 : chatterRate === "medium" ? 0.26 : 0.18;
		let accusationChance = accusationRate === "high" ? 0.56 : accusationRate === "medium" ? 0.32 : 0.12;
		let claimChance = claimRate === "high" ? 0.42 : claimRate === "medium" ? 0.22 : 0.08;

		// Confidence makes assertive plans more likely without changing the profile itself
		deceptionChance *= confidenceMultiplier;
		accusationChance *= confidenceMultiplier;
		claimChance *= confidenceMultiplier;

		// Without private findings, the bot may chatter more but should accuse or claim less
		if (!context.hasRecentFindings) {
			chatterChance += 0.18;
			accusationChance *= 0.5;
			claimChance *= 0.45;
		}
		if (claimRate === "high") {
			chatterChance -= 0.08;
		}
		if (context.hasMentionedQuestion || context.hasRecentClaims || context.phase === "voting") {
			chatterChance = Math.min(chatterChance, 0.12);
		}
		if (context.hasMentionedQuestion) {
			claimChance += 0.12;
		}
		// Day one should feel alive without letting bots manufacture early pressure
		if (context.dayNumber === 1 && context.phase === "day") {
			deceptionChance = Math.min(deceptionChance, 0.2);
			chatterChance = Math.max(chatterChance, 0.45);
			accusationChance = 0;
		}

		deceptionChance = this.clampChance(deceptionChance);
		chatterChance = this.clampChance(chatterChance);
		accusationChance = this.clampChance(accusationChance);
		claimChance = this.clampChance(claimChance);

		return {
			deceptionPlan: { deceptionRate, deceptionChance, shouldDeceive: this.rollChance(deceptionChance) },
			chatterPlan: { chatterRate, chatterChance, shouldChatter: this.rollChance(chatterChance) },
			accusationPlan: { accusationRate, accusationChance, shouldAccuse: this.rollChance(accusationChance) },
			claimPlan: { claimRate, claimChance, shouldClaim: this.rollChance(claimChance) }
		};
	}

	private createActionPlan(profileJson: unknown, phase: "voting" | "night"): BotActionPlan {
		const profile = this.readBotProfile(profileJson);
		const riskLevel = phase === "voting" ? profile.actionStyle.voteRisk : profile.actionStyle.nightRisk;
		const riskChance = riskLevel === "risky" ? 0.72 : riskLevel === "balanced" ? 0.45 : 0.18;

		return { riskLevel, riskChance, shouldTakeRisk: this.rollChance(riskChance), targetPriority: profile.actionStyle.targetPriority };
	}

	private readBotProfile(profileJson: unknown): BotProfile {
		const profile: BotProfile = {
			talkStyle: { ...DEFAULT_BOT_PROFILE.talkStyle },
			actionStyle: {
				voteRisk: DEFAULT_BOT_PROFILE.actionStyle.voteRisk,
				nightRisk: DEFAULT_BOT_PROFILE.actionStyle.nightRisk,
				targetPriority: [...DEFAULT_BOT_PROFILE.actionStyle.targetPriority]
			}
		};

		// Bot memory is persisted JSON, so every field is read defensively before use
		if (profileJson === null || typeof profileJson !== "object" || Array.isArray(profileJson)) {
			return profile;
		}

		const storedProfile = profileJson as Partial<BotProfile>;

		if (storedProfile.talkStyle && typeof storedProfile.talkStyle === "object") {
			profile.talkStyle = {
				confidence: this.readRateLevel(storedProfile.talkStyle.confidence, profile.talkStyle.confidence),
				accusationRate: this.readRateLevel(storedProfile.talkStyle.accusationRate, profile.talkStyle.accusationRate),
				claimRate: this.readRateLevel(storedProfile.talkStyle.claimRate, profile.talkStyle.claimRate),
				deceptionRate: this.readRateLevel(storedProfile.talkStyle.deceptionRate, profile.talkStyle.deceptionRate),
				questionRate: this.readRateLevel(storedProfile.talkStyle.questionRate, profile.talkStyle.questionRate)
			};
		}

		if (storedProfile.actionStyle && typeof storedProfile.actionStyle === "object") {
			profile.actionStyle = {
				voteRisk: this.readRiskLevel(storedProfile.actionStyle.voteRisk, profile.actionStyle.voteRisk),
				nightRisk: this.readRiskLevel(storedProfile.actionStyle.nightRisk, profile.actionStyle.nightRisk),
				targetPriority: this.readStringList(storedProfile.actionStyle.targetPriority, profile.actionStyle.targetPriority)
			};
		}

		return profile;
	}

	private getDiscussionGoal(phase: PhaseType, dayNumber: number): string {
		if (dayNumber === 1 && phase === "day") {
			return BOT_RULE_BOOK.discussion.goals.firstDay;
		}

		if (phase === "voting") {
			return BOT_RULE_BOOK.discussion.goals.voting;
		}

		return BOT_RULE_BOOK.discussion.goals.regular;
	}

	private getRoleRule(roleKey: string): typeof BOT_RULE_BOOK.roles[keyof typeof BOT_RULE_BOOK.roles] | undefined {
		return BOT_RULE_BOOK.roles[roleKey as keyof typeof BOT_RULE_BOOK.roles];
	}

	private createRuleBookForAvailableRoleKeys(availableRoleKeys: string[]): BotRuleBookMemory {
		// Only send role rules that can appear in this game, reducing hallucinated role discussion
		const allowedRoleKeys = new Set(availableRoleKeys);
		const roles = Object.fromEntries(Object.entries(BOT_RULE_BOOK.roles).filter(([roleKey]) => allowedRoleKeys.has(roleKey))) as Partial<typeof BOT_RULE_BOOK.roles>;

		return { ...BOT_RULE_BOOK, roles };
	}

	private createTargetMemory(players: GameStatePlayer[], playerId: number, includeSelf: boolean, includeKnownAlly: boolean) {
		// Target indexes are prompt-local and later mapped back to player ids after validation
		return players.filter((player) => !player.isEliminated).filter((player) => includeSelf || player.playerId !== playerId).filter((player) => includeKnownAlly || !player.isKnownAlly).map((player, index) => ({ targetIndex: index, playerId: player.playerId, username: player.username }));
	}

	private createActionChoices(actionTypes: PlayerActionType[]): BotActionChoice[] {
		// Skip is always option zero so malformed or cautious decisions have a safe fallback
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
		return recentChat.filter(predicate).map((message) => message.message.trim()).filter(Boolean).slice(-limit);
	}

	private combineMessageLists(left: string[], right: string[], limit: number): string[] {
		// Keep order while removing case-insensitive duplicates from chat and memory sources
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
		return memory.decisionHistory.map((entry) => entry as Partial<BotDecisionHistoryEntry>).map((entry) => typeof entry.message === "string" ? entry.message.trim() : "").filter(Boolean).slice(-limit);
	}

	private getReservedDiscussionMessages(gameId: number, phase: PhaseType, dayNumber: number): string[] {
		const key = this.createDiscussionMessageKey(gameId, phase, dayNumber);

		// Pruning on read keeps the map small without requiring a background timer
		this.pruneReservedDiscussionMessages(gameId, key, Date.now());

		return [...(this.recentDiscussionMessagesByPhase.get(key)?.messages ?? [])];
	}

	private rememberReservedDiscussionMessage(gameId: number, phase: PhaseType, dayNumber: number, message: string): void {
		const key = this.createDiscussionMessageKey(gameId, phase, dayNumber);
		const now = Date.now();
		const messages = this.recentDiscussionMessagesByPhase.get(key)?.messages ?? [];

		messages.push(message);
		this.recentDiscussionMessagesByPhase.set(key, { messages: messages.slice(-MAX_RESERVED_DISCUSSION_MESSAGES), updatedAt: now });

		// Reserving generated lines immediately helps parallel bots avoid identical fallback text
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

	private areMessagesTooSimilar(left: string, right: string): boolean {
		const leftWords = this.normalizeDiscussionMessage(left);
		const rightWords = this.normalizeDiscussionMessage(right);

		if (leftWords.length === 0 || rightWords.length === 0) return false;
		if (leftWords.join(" ") === rightWords.join(" ")) return true;
		if (Math.min(leftWords.length, rightWords.length) < 4) return false;

		// The heuristic combines word overlap with adjacent-word overlap to catch near-repeats
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

	private createNonRepeatingDiscussionFallback(phase: PhaseType, dayNumber: number, playerId: number, recentMessages: string[]): string | null {
		const candidates = this.getDiscussionFallbackCandidates(phase, dayNumber);
		// Player-based offset spreads fallback lines across bots in the same phase
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

	private readChoiceResult(result: unknown): BotChoiceResult | null {
		// Ollama sometimes returns numeric values as strings, so numeric strings are accepted
		if (result === null || typeof result !== "object") return null;

		const raw = result as { choiceIndex?: unknown; targetIndex?: unknown; reason?: unknown };
		const choiceIndex = typeof raw.choiceIndex === "number" && Number.isInteger(raw.choiceIndex) ? raw.choiceIndex : typeof raw.choiceIndex === "string" && /^\d+$/.test(raw.choiceIndex.trim()) ? Number(raw.choiceIndex) : null;
		const targetIndex = raw.targetIndex === undefined || raw.targetIndex === null || raw.targetIndex === "null" ? null : typeof raw.targetIndex === "number" && Number.isInteger(raw.targetIndex) ? raw.targetIndex : typeof raw.targetIndex === "string" && /^\d+$/.test(raw.targetIndex.trim()) ? Number(raw.targetIndex) : undefined;
		if (choiceIndex === null || targetIndex === undefined) return null;

		return { choiceIndex, targetIndex, reason: typeof raw.reason === "string" ? raw.reason.trim() : "" };
	}

	// Discussion fallback
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

	// Helpers
	private normalizeOllamaChatUrl(url: string): string {
		const cleanUrl = url.replace(/\/+$/, "");
		return cleanUrl.endsWith("/api/chat") ? cleanUrl : `${cleanUrl}/api/chat`;
	}

	private readStringList(value: unknown, fallback: string[]): string[] {
		if (!Array.isArray(value)) return fallback;

		const items = value
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);

		return items.length > 0 ? items : fallback;
	}

	private readRateLevel(value: unknown, fallback: RateLevel): RateLevel {
		return botRateLevels.includes(value as RateLevel) ? value as RateLevel : fallback;
	}

	private readRiskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
		return botRiskLevels.includes(value as RiskLevel) ? value as RiskLevel : fallback;
	}

	private rollChance(chance: number): boolean {
		return Math.random() < this.clampChance(chance);
	}

	private clampChance(chance: number): number {
		return Math.max(0, Math.min(1, chance));
	}

	private normalizeDiscussionMessage(message: string): string[] {
		return message.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2);
	}

	private getObjectKeys(value: unknown): string[] {
		return value !== null && typeof value === "object" ? Object.keys(value) : [];
	}

	private ensureMemoryObject(memoryJson: unknown, gameId: number, playerId: number): Record<string, unknown> {
		if (memoryJson !== null && typeof memoryJson === "object" && !Array.isArray(memoryJson)) {
			return { ...(memoryJson as Record<string, unknown>) };
		}

		return { gameId, playerId };
	}

	private logBotFailure(message: string, details?: Record<string, unknown>): void {
		if (process.env.NODE_ENV !== "development") return;
		console.error(message, details);
	}
}

export default new BotService();
