import { WSBaseSessionManager } from "./WSBaseSessionManager";
import type { GameFinishedPlayer, GameStateData, GameStatePlayer, ConnectedUserSocket, FinishedGameWinner, InGameDayActionHistory, InGameSession, LobbySession, MetaSettings, PlayerAction, PlayerActionType, PlayerState, BotNightActionState } from "../../../types/websocket/types";

import type { Role } from "../../../types/entities/role";
import type { CreateGameChatMessage, PhaseType, ResponseGameChatMessage } from "../../../types/entities/gameChatMessage";

export class WSGameSessionManager extends WSBaseSessionManager<InGameSession> {
	private readonly botActionMinimumRemainingMs = 10_000;
	private readonly botDiscussionMinimumRemainingMs = 5_000;
	private readonly botDiscussionMinimumDelayMs = 1_000;
	private readonly botDiscussionMaximumDelayMs = 5_000;
	private readonly botDiscussionTalkChance = 0.5;
	private readonly botVotingDiscussionTalkChance = 0.2;

	public constructor(
		onGameCancelled: (gameId: number) => Promise<void>,
		private readonly onGameChatMessage: (gameId: number, message: CreateGameChatMessage) => Promise<void>,
		private readonly onResolvePhase: (gameId: number, phase: PhaseType, dayNumber: number, pendingActions: Map<number, PlayerAction>, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, metaSettings: MetaSettings) => Promise<{ winner: FinishedGameWinner | null }>,
		private readonly onGameFinished: (gameId: number, actionHistory: InGameDayActionHistory[], winner: FinishedGameWinner, players: GameFinishedPlayer[]) => Promise<void>,
		private readonly onPhaseStarted: (gameId: number) => void,
		private readonly chooseBotVoteAction: (gameId: number, playerId: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number) => Promise<PlayerAction>,
		private readonly chooseBotNightAction: (gameId: number, playerId: number, actionState: BotNightActionState, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number) => Promise<PlayerAction>,
		private readonly makeBotDiscussion: (gameId: number, playerId: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number) => Promise<CreateGameChatMessage | null>
	) {
		super(onGameCancelled);
	}

	public async start(): Promise<void> {
		if (this.timer) return;

		// Periodically removes sessions that are empty or inactive for too long
		this.timer = setInterval(() => {
			for (const gameId of this.getExpiredGameIds()) {
				const session = this.sessions.get(gameId);
				if (!session) continue;

				this.clearSessionTimers(session);
				this.sessions.delete(gameId);
				this.cancelGameDetached(gameId);
			}
		}, this.cleanupIntervalMs);

		this.timer.unref?.();
	}

	// Stops cleanup timer and clears all active sessions
	public async stop(): Promise<void> {
		this.stopTimer();

		for (const session of this.sessions.values()) {
			this.clearSessionTimers(session);
		}

		await this.cancelAllSessions();
		this.sessions.clear();
	}

	public getPhaseAndDay(gameId: number): { currentPhase: PhaseType; dayNumber: number } | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		return { currentPhase: session.currentPhase, dayNumber: session.dayNumber };
	}

	public getGameState(gameId: number, viewerPlayerId: number): GameStateData | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const viewerRole = session.playerRoles.get(viewerPlayerId);
		if (!viewerRole) return null;

		return {
			gameCode: session.gameCode,
			gameId,
			myPlayerId: viewerPlayerId,
			myRoleKey: viewerRole.key,
			myIsJailed: session.playerStates.get(viewerPlayerId)?.phase.isJailed ?? false,
			availableActions: this.getAvailablePlayerActionTypes(session, viewerPlayerId),
			players: this.getGameStatePlayers(session, viewerPlayerId),
			currentPhase: session.currentPhase,
			dayNumber: session.dayNumber,
			phaseEndsAt: session.phaseEndsAt,
			phaseStartedAt: session.phaseStartedAt
		};
	}

	public isPlayerEliminated(gameId: number, playerId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		return this.isEliminated(session, playerId);
	}

	public getBotNightActionState(gameId: number, playerId: number): BotNightActionState | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const role = session.playerRoles.get(playerId);
		const state = session.playerStates.get(playerId);
		if (!role || !state) return null;

		return {
			roleKey: role.key,
			dayNumber: session.dayNumber,
			vampireMissedEliminationCycles: state.runtime.vampireMissedEliminationCycles,
			hasUsedConvert: state.runtime.hasUsedConvert,
			chroniclerCurrentRoleKey: state.runtime.chroniclerCurrentRoleKey
		};
	}
	
	public createFromLobby(gameId: number, lobby: LobbySession, rolesByPlayerId: Map<number, Role>): void {
		const now = Date.now();

		const playerStates = new Map<number, PlayerState>();

		for (const playerId of lobby.players.keys()) {
			playerStates.set(playerId, {
				runtime: {
					isEliminated: false,
					vampireMissedEliminationCycles: 0,
					hasUsedConvert: false,
					isConverted: false,
					serialKillerEliminationCount: 0,
					chroniclerCorrectGuessCount: 0,
					chroniclerGuessedRoleKeys: new Set(),
					chroniclerCurrentRoleKey: null
				},
				phase: {
					visitedByPlayerIds: new Set(),
					isJailed: false,
					isProtected: false,
					wasProtectedFromElimination: false
				}
			});
		}

		const session: InGameSession = {
			gameCode: lobby.gameCode,
			sockets: new Set(lobby.sockets),
			userSocketCounts: new Map(lobby.userSocketCounts),
			players: new Map(lobby.players),
			metaSettings: { ...lobby.metaSettings },
			roleSettings: { ...lobby.roleSettings },
			botSettings: { ...lobby.botSettings },
			status: "in_progress",
			createdAt: lobby.createdAt,
			lastActiveAt: now,
			emptySince: lobby.emptySince,
			playerRoles: new Map(rolesByPlayerId),
			dayNumber: 1,
			currentPhase: "day",
			phaseStartedAt: now,
			phaseEndsAt: now + lobby.metaSettings.daySeconds * 1000,
			pendingActions: new Map(),
			playerStates,
			actionHistory: [{ day: [], voting: [], night: [] }],
			gameChatMessages: []
		};

		this.sessions.set(gameId, session);
	}

	// Adds socket to in-game session
	public joinSession(ws: ConnectedUserSocket, gameId: number, playerId: number): InGameSession | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		if (!session.players.has(playerId)) {
			return null;
		}

		session.sockets.add(ws);

		const next = (session.userSocketCounts.get(playerId) ?? 0) + 1;
		session.userSocketCounts.set(playerId, next);

		// If first socket, mark as online
		if (next === 1) {
			const player = session.players.get(playerId);
			if (player) {
				player.isOnline = true;
			}
		}

		return session;
	}

	// Removes socket from in-game session
	public leaveSession(ws: ConnectedUserSocket, gameId: number, playerId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const removed = session.sockets.delete(ws);
		if (!removed) return false;

		const next = (session.userSocketCounts.get(playerId) ?? 0) - 1;

		// If no sockets, mark player as offline
		if (next <= 0) {
			session.userSocketCounts.delete(playerId);

			const player = session.players.get(playerId);
			if (player) {
				player.isOnline = false;
			}
		} else {
			session.userSocketCounts.set(playerId, next);
		}

		return true;
	}

	public submitPlayerAction(gameId: number, action: PlayerAction): boolean {
		const session = this.sessions.get(gameId);
		if (!session || session.status !== "in_progress") return false;

		if (!this.validatePlayerAction(session, action)) return false;

		// Map set overwrites previous action, so player can change action during the phase
		session.pendingActions.set(action.playerId, action);
		return true;
	}

	public startPhaseTimer(gameId: number, phase: PhaseType = "day"): void {
		const session = this.sessions.get(gameId);
		if (!session || session.status !== "in_progress") return;

		this.clearSessionTimers(session);
		session.currentPhase = phase;

		const now = Date.now();

		// Calculate current phase duration from game settings
		switch (phase) {
			case "day":
				session.phaseEndsAt = now + session.metaSettings.daySeconds * 1000;
				break;
			case "voting":
				session.phaseEndsAt = now + session.metaSettings.votingSeconds * 1000;
				break;
			case "night":
				session.phaseEndsAt = now + session.metaSettings.nightSeconds * 1000;
				break;
		}

		session.phaseStartedAt = now;

		this.scheduleBotActions(gameId, session);
		this.scheduleNextBotDiscussion(gameId, session);

		session.phaseTimer = setTimeout(() => {
			void this.resolveAndAdvancePhase(gameId);
		}, session.phaseEndsAt - session.phaseStartedAt);

		session.phaseTimer.unref?.();
	}

	public endSession(gameId: number): void {
		const session = this.sessions.get(gameId);
		if (session) {
			this.clearSessionTimers(session);
			this.sessions.delete(gameId);
		}
	}

	public addGameChatMessage(gameId: number, message: InGameSession["gameChatMessages"][number]): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.gameChatMessages.push(message);
		return true;
	}

	private validatePlayerAction(session: InGameSession, action: PlayerAction): boolean {
		// Actor must exist
		if (!session.players.has(action.playerId)) return false;
		// Actor must not be eliminated
		if (this.isEliminated(session, action.playerId)) return false;

		const state = session.playerStates.get(action.playerId);
		if (!state) return false;

		// Jailed players cannot act
		if (state.phase.isJailed) return false;

		// If skipping, no target
		if (action.type === "skip") {
			return action.targetPlayerId === null && session.currentPhase !== "day";
		}

		// If not skipping, must have a target
		if (action.targetPlayerId === null) return false;
		// Target must exist
		if (!session.players.has(action.targetPlayerId)) return false;
		// Target must not be eliminated
		if (this.isEliminated(session, action.targetPlayerId)) return false;

		switch (session.currentPhase) {
			// No actions allowed during day time
			case "day":
				return false;
			// Only voting allowed during voting time
			case "voting":
				return action.type === "vote";
			// Per role actions
			case "night": {
				// Night actions cannot target self
				if (action.targetPlayerId === action.playerId) return false;

				const role = session.playerRoles.get(action.playerId);
				const targetRole = session.playerRoles.get(action.targetPlayerId);
				if (!role || !targetRole) return false;

				// Vampires know each other and should not target allies
				if (role.alignment === "vampire" && targetRole.alignment === "vampire") {
					return false;
				}

				switch (role.key) {
					case "vampire":
					case "bloodBank":
						// Can eliminate on first night, then every second night
						return action.type === "eliminate" && (session.dayNumber === 1 || state.runtime.vampireMissedEliminationCycles >= 1);
					case "count":
						// Can eliminate on first night, then every second night, or convert once
						return (
							(action.type === "eliminate" && (session.dayNumber === 1 || state.runtime.vampireMissedEliminationCycles >= 1)) ||
							(action.type === "convert" && !state.runtime.hasUsedConvert)
						);
					case "visionary":
						// Can inspect target alignment
						return action.type === "inspect";
					case "vigilante":
						// Can eliminate a target
						return action.type === "eliminate";
					case "watchman":
						// Can see who visited the target
						return action.type === "watch";
					case "jailor":
						// Can block target next cycle
						return action.type === "jail";
					case "priest":
						// Can protect target from elimination
						return action.type === "protect";
					case "serialKiller":
						// Can eliminate every night
						return action.type === "eliminate";
					case "chronicler":
						// Can guess who has the assigned role
						return action.type === "guess" && state.runtime.chroniclerCurrentRoleKey !== null;
					case "commoner":
					case "jester":
						// No night actions
						return false;
					default:
						return false;
				}
			}
			default:
				return false;
		}
	}

	private getAvailablePlayerActionTypes(session: InGameSession, playerId: number): PlayerActionType[] {
		const role = session.playerRoles.get(playerId);
		const state = session.playerStates.get(playerId);

		if (!role || !state) return [];
		if (state.runtime.isEliminated || state.phase.isJailed) return [];

		switch (session.currentPhase) {
			case "day":
				return [];
			case "voting":
				return ["vote", "skip"];
			case "night": {
				const actions = this.getAvailableNightActionTypes(session, playerId, role, state);

				return actions.length > 0 ? [...actions, "skip"] : [];
			}
		}
	}

	private getAvailableNightActionTypes(session: InGameSession, playerId: number, role: Role, state: PlayerState): PlayerActionType[] {
		const hasTargets = Array.from(session.players.keys()).some((targetPlayerId) => {
			if (targetPlayerId === playerId) return false;
			if (this.isEliminated(session, targetPlayerId)) return false;

			const targetRole = session.playerRoles.get(targetPlayerId);
			if (!targetRole) return false;

			return !(role.alignment === "vampire" && targetRole.alignment === "vampire");
		});

		if (!hasTargets) return [];

		switch (role.key) {
			case "vampire":
			case "bloodBank":
				return session.dayNumber === 1 || state.runtime.vampireMissedEliminationCycles >= 1 ? ["eliminate"] : [];
			case "count": {
				const actions: PlayerActionType[] = [];
				if (session.dayNumber === 1 || state.runtime.vampireMissedEliminationCycles >= 1) {
					actions.push("eliminate");
				}
				if (!state.runtime.hasUsedConvert) {
					actions.push("convert");
				}
				return actions;
			}
			case "visionary":
				return ["inspect"];
			case "vigilante":
				return ["eliminate"];
			case "watchman":
				return ["watch"];
			case "jailor":
				return ["jail"];
			case "priest":
				return ["protect"];
			case "serialKiller":
				return ["eliminate"];
			case "chronicler":
				return state.runtime.chroniclerCurrentRoleKey === null ? [] : ["guess"];
			default:
				return [];
		}
	}

	// Resolves current phase, finishes game if winner exists and starts next phase
	private async resolveAndAdvancePhase(gameId: number): Promise<void> {
		const session = this.sessions.get(gameId);
		if (!session || session.status !== "in_progress") return;

		const phase = session.currentPhase;
		const actions = new Map(session.pendingActions);
		const currentDayHistory = session.actionHistory[session.actionHistory.length - 1];

		if (phase !== "day") {
			for (const playerId of session.players.keys()) {
				if (actions.has(playerId)) continue;

				const state = session.playerStates.get(playerId);
				if (!state) continue;
				if (state.runtime.isEliminated || state.phase.isJailed) continue;

				actions.set(playerId, { playerId, type: "skip", targetPlayerId: null });
			}
		}

		if (currentDayHistory) {
			currentDayHistory[phase].push(...actions.values());
		}

		// onResolvePhase mutates playerStates and playerRoles directly
		const result = await this.onResolvePhase(gameId, phase, session.dayNumber, actions, session.playerStates, session.playerRoles, session.metaSettings);
		session.pendingActions.clear();

		if (result.winner) {
			await this.finishGame(gameId, session, result.winner);
			return;
		}

		// First day skips voting, after that day goes to voting
		switch (phase) {
			case "day":
				await this.startNextPhase(gameId, session, session.dayNumber === 1 ? "night" : "voting");
				return;
			case "voting":
				await this.startNextPhase(gameId, session, "night");
				return;
			case "night":
				session.dayNumber++;
				session.actionHistory.push({ day: [], voting: [], night: [] });
				await this.startNextPhase(gameId, session, "day");
				return;
		}
	}

	private async startNextPhase(gameId: number, session: InGameSession, nextPhase: PhaseType): Promise<void> {
		this.startPhaseTimer(gameId, nextPhase);
		this.onPhaseStarted(gameId);

		await this.onGameChatMessage(gameId, {
			gameId,
			playerId: null,
			message: `Phase changed to ${nextPhase}`,
			dayNumber: session.dayNumber,
			phase: nextPhase,
			messageType: "system"
		});
	}

	// Finishes game session
	private async finishGame(gameId: number, session: InGameSession, winner: FinishedGameWinner): Promise<void> {
		this.clearSessionTimers(session);

		session.status = "finished";
		session.finishedWinner = winner;

		const players: GameFinishedPlayer[] = [];
		for (const player of session.players.values()) {
			const role = session.playerRoles.get(player.playerId);
			players.push({
				playerId: player.playerId,
				username: player.username,
				roleKey: role?.key ?? "unknown",
				isEliminated: this.isEliminated(session, player.playerId)
			});
		}

		await this.onGameFinished(gameId, session.actionHistory, winner, players);
	}

	// Executes bot actions
	private scheduleBotActions(gameId: number, session: InGameSession): void {
		// Bots only act during voting and night phases
		if (session.currentPhase !== "voting" && session.currentPhase !== "night") {
			return;
		}

		const phaseEndsAt = session.phaseEndsAt;

		// Execute immediately so bots can use the full phase duration
		void (async () => {
			const botPlayerIds = this.getActiveBotPlayerIds(session);

			await Promise.allSettled(botPlayerIds.map(async playerId => {
				const remainingMs = phaseEndsAt - Date.now();
				if (remainingMs < this.botActionMinimumRemainingMs) return;
				if (this.getAvailablePlayerActionTypes(session, playerId).length === 0) return;

				const players = this.getGameStatePlayers(session, playerId);

				const action = session.currentPhase === "voting"
					? await this.chooseBotVoteAction(gameId, playerId, players, session.gameChatMessages, remainingMs)
					: await this.chooseBotNightAction(gameId, playerId, this.getBotNightActionState(gameId, playerId) ?? {
						roleKey: null,
						dayNumber: session.dayNumber,
						vampireMissedEliminationCycles: 0,
						hasUsedConvert: true,
						chroniclerCurrentRoleKey: null
					}, players, session.gameChatMessages, remainingMs);
				
				// Ignore result if phase already ended while bot was thinking
				if (Date.now() >= phaseEndsAt) return;

				this.submitPlayerAction(gameId, action);
			}));
		})();
	}

	// Schedules next bot discussion check
	private scheduleNextBotDiscussion(gameId: number, session: InGameSession): void {
		if (session.botDiscussionTimer) {
			clearTimeout(session.botDiscussionTimer);
			session.botDiscussionTimer = undefined;
		}

		if (session.status !== "in_progress") {
			return;
		}

		// Bot discussion is regular during day and occasional during voting.
		if (session.currentPhase !== "day" && session.currentPhase !== "voting") {
			return;
		}

		const discussionDeadlineAt = this.getBotDiscussionDeadlineAt(session);
		const remainingMs = discussionDeadlineAt - Date.now();

		// Do not schedule discussion if phase is close to ending
		if (remainingMs < this.botDiscussionMinimumRemainingMs) {
			return;
		}

		const minimumDelayMs = this.botDiscussionMinimumDelayMs;
		const maximumDelayMs = Math.min(this.botDiscussionMaximumDelayMs, remainingMs - this.botDiscussionMinimumRemainingMs);
		const delayMs = minimumDelayMs + Math.floor(Math.random() * (Math.max(minimumDelayMs, maximumDelayMs) - minimumDelayMs + 1));

		session.botDiscussionTimer = setTimeout(() => {
			void this.runBotDiscussionTick(gameId, session);
		}, delayMs);

		session.botDiscussionTimer.unref?.();
	}

	// Runs one bot discussion tick and schedules the next one
	private async runBotDiscussionTick(gameId: number, session: InGameSession): Promise<void> {
		if (session.status !== "in_progress") return;
		if (session.currentPhase !== "day" && session.currentPhase !== "voting") return;

		try {
			const discussionDeadlineAt = this.getBotDiscussionDeadlineAt(session);
			const requestPhase = session.currentPhase;
			const requestDayNumber = session.dayNumber;
			const botPlayerIds = this.getActiveBotPlayerIds(session);
			const talkChance = requestPhase === "voting" ? this.botVotingDiscussionTalkChance : this.botDiscussionTalkChance;

			// Shuffle bot order so the same bot does not always get first chance to talk
			for (let i = botPlayerIds.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));

				[botPlayerIds[i], botPlayerIds[j]] = [botPlayerIds[j], botPlayerIds[i]];
			}

			for (const playerId of botPlayerIds) {
				// Each bot randomly decides whether to talk during this discussion tick
				if (Math.random() > talkChance) continue;

				const remainingMs = discussionDeadlineAt - Date.now();
				if (remainingMs < this.botDiscussionMinimumRemainingMs) return;

				const players = this.getGameStatePlayers(session, playerId);
				const message = await this.makeBotDiscussion(gameId, playerId, players, session.gameChatMessages, remainingMs);
				if (!message) continue;

				const currentSession = this.sessions.get(gameId);
				const currentPhase = currentSession?.currentPhase;

				// Ignore message if night already started while bot was thinking
				if (!currentSession || Date.now() >= discussionDeadlineAt || currentPhase === "night") return;
				if (currentPhase !== "day" && currentPhase !== "voting") return;

				message.phase = currentPhase === "voting" ? "voting" : requestPhase;
				message.dayNumber = currentSession.dayNumber === requestDayNumber ? requestDayNumber : currentSession.dayNumber;

				await this.onGameChatMessage(gameId, message);

				// Only one bot talks per discussion tick
				break;
			}
		} finally {
			this.scheduleNextBotDiscussion(gameId, session);
		}
	}

	private getBotDiscussionDeadlineAt(session: InGameSession): number {
		if (session.currentPhase !== "day") {
			return session.phaseEndsAt;
		}

		if (session.dayNumber === 1) {
			return session.phaseEndsAt;
		}

		return session.phaseEndsAt + session.metaSettings.votingSeconds * 1000;
	}

	private getActiveBotPlayerIds(session: InGameSession): number[] {
		const botPlayerIds: number[] = [];

		for (const player of session.players.values()) {
			if (player.type !== "bot") continue;
			if (this.isEliminated(session, player.playerId)) continue;

			botPlayerIds.push(player.playerId);
		}

		return botPlayerIds;
	}

	// Gets game state players from player perspective
	private getGameStatePlayers(session: InGameSession, viewerPlayerId: number): GameStatePlayer[] {
		const viewerRole = session.playerRoles.get(viewerPlayerId);
		const players: GameStatePlayer[] = [];

		for (const player of session.players.values()) {
			const role = session.playerRoles.get(player.playerId);

			players.push({
				playerId: player.playerId,
				type: player.type,
				username: player.username,
				iconEtag: player.iconEtag,
				seatNr: player.seatNr,
				isEliminated: this.isEliminated(session, player.playerId),
				isKnownAlly: Boolean(viewerRole && role && viewerRole.alignment === "vampire" && role.alignment === "vampire")
			});
		}

		return players;
	}

	private isEliminated(session: InGameSession, playerId: number): boolean {
		return session.playerStates.get(playerId)?.runtime.isEliminated ?? false;
	}

	private clearSessionTimers(session: InGameSession): void {
		if (session.phaseTimer) {
			clearTimeout(session.phaseTimer);

			session.phaseTimer = undefined;
		}

		if (session.botDiscussionTimer) {
			clearTimeout(session.botDiscussionTimer);

			session.botDiscussionTimer = undefined;
		}
	}
}
