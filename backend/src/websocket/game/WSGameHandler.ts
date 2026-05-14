import { AppError, ErrorCode } from "../../types";
import type { ClientMessage } from "../../types/websocket/client";
import type { ServerMessage } from "../../types/websocket/server";
import type { BotNightActionState, BotSettings, ConnectedUserSocket, FinishedGameWinner, GameFinishedPlayer, GameStatePlayer, InGameDayActionHistory, LobbyPlayer, LobbySession, MetaSettings, PlayerAction, PlayerActionType, PlayerState, RoleSettings } from "../../types/websocket/types";
import type { CreateGameChatMessage, PhaseType, ResponseGameChatMessage } from "../../types/entities/gameChatMessage";

import type { BotDifficulty, BotPlaystyle } from "../../types/entities/gameBotSetup";
import type { Role } from "../../types/entities/role";

import { AsyncKeyLock } from "../../utils/asyncKeyLock";

import { WSLobbySessionManager } from "./sessions/WSLobbySessionManager";
import { WSGameSessionManager } from "./sessions/WSGameSessionManager";

import GameService from "../../services/gameService";
import UserService from "../../services/userService";
import GameLobbyService from "../../services/gameLobbyService";
import RoleService from "../../services/roleService";
import BotService from "../../services/botService";
import ChatService from "../../services/chatService";
import GamePhaseService from "../../services/gamePhaseService";

export class WSGameHandler {
	private readonly lobbySessions: WSLobbySessionManager;
	private readonly gameSessions: WSGameSessionManager;
	private readonly lobbyLocks = new AsyncKeyLock<number>();
	private readonly gameLocks = new AsyncKeyLock<number>();

	public constructor(private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) {
		this.lobbySessions = new WSLobbySessionManager(
			() => RoleService.getRoles(),
			(gameId) => GameService.cancelGame(gameId),
			(gameId, startsAt) => this.broadcastToLobby(gameId, { type: "GAME_STARTING", startsAt }),
			(gameId) => this.broadcastToLobby(gameId, { type: "GAME_START_CANCELLED" }),
			(gameId) => this.onGameStart(gameId)
		);

		this.gameSessions = new WSGameSessionManager(
			(gameId) => GameService.cancelGame(gameId),
			(gameId, chatMessage) => this.onGameChatMessage(gameId, chatMessage),
			(gameId, phase, dayNumber, pendingActions, playerStates, playerRoles, metaSettings) => this.onResolvePhase(gameId, phase, dayNumber, pendingActions, playerStates, playerRoles, metaSettings),
			(gameId, actionHistory, finishedWinner, players) => this.onGameFinished(gameId, actionHistory, finishedWinner, players),
			(gameId) => this.broadcastGameState(gameId),
			(gameId, playerId, players, gameChatMessages, timeoutMs) => this.botVoteAction(gameId, playerId, players, gameChatMessages, timeoutMs),
			(gameId, playerId, actionState, players, gameChatMessages, timeoutMs) => this.botNightAction(gameId, playerId, actionState, players, gameChatMessages, timeoutMs),
			(gameId, playerId, players, gameChatMessages, timeoutMs) => this.botChatAction(gameId, playerId, players, gameChatMessages, timeoutMs)
		);

		void this.lobbySessions.start();
		void this.gameSessions.start();
	}

	public untrack(ws: ConnectedUserSocket): void {
		const gameId = ws.game?.id;
		const playerId = ws.userToken?.playerId;

		if (gameId && playerId) {
			this.lobbySessions.leaveSession(ws, gameId, playerId);
			this.gameSessions.leaveSession(ws, gameId, playerId);
		}

		ws.game = undefined;
	}

	public async stop(): Promise<void> {
		await Promise.all([
			this.lobbySessions.stop(),
			this.gameSessions.stop()
		]);
	}

	private async ensureLobbySession(gameId: number): Promise<boolean> {
		if (this.lobbySessions.getLobbyState(gameId)) {
			return true;
		}

		const snapshot = await GameService.getLobbyGameSnapshot(gameId);
		if (!snapshot) {
			return false;
		}

		this.lobbySessions.create(gameId, snapshot.game.gameCode, {
			maxPlayers: snapshot.game.maxPlayers,
			minPlayers: snapshot.game.minPlayers,
			daySeconds: snapshot.game.daySeconds,
			votingSeconds: snapshot.game.votingSeconds,
			nightSeconds: snapshot.game.nightSeconds,
			tieBehavior: snapshot.game.tieBehavior,
			voteCountVisibility: snapshot.game.voteCountVisibility,
			anonymousVoting: snapshot.game.anonymousVoting,
			roleRevealOnDeath: snapshot.game.roleRevealOnDeath,
			roleDistributionMode: snapshot.game.roleDistributionMode
		}, snapshot.roleSettings, snapshot.botSettings as BotSettings);

		for (const participant of snapshot.participants) {
			this.lobbySessions.upsertPlayer(gameId, participant, participant.username, participant.iconEtag, participant.type);
		}

		return true;
	}

	private async ensureInGameSession(ws: ConnectedUserSocket, gameId: number): Promise<boolean> {
		const playerId = ws.userToken?.playerId;
		if (!playerId) {
			return false;
		}

		const existingPhase = this.gameSessions.getPhaseAndDay(gameId);
		if (existingPhase) {
			const joined = this.gameSessions.joinSession(ws, gameId, playerId);
			return Boolean(joined || this.gameSessions.getGameState(gameId, playerId));
		}

		const snapshot = await GameService.getInProgressGameSnapshot(gameId);
		if (!snapshot) {
			return false;
		}

		const currentParticipant = snapshot.participants.find((participant) => participant.playerId === playerId);
		if (!currentParticipant) {
			return false;
		}

		const roles = this.lobbySessions.getRoles().length > 0 ? this.lobbySessions.getRoles() : await RoleService.getRoles();
		const rolesById = new Map(roles.map((role) => [role.id, role]));
		const rolesByPlayerId = new Map<number, Role>();

		for (const participant of snapshot.participants) {
			if (participant.roleId === null) continue;

			const role = rolesById.get(participant.roleId);
			if (!role) continue;

			rolesByPlayerId.set(participant.playerId, role);
		}

		if (rolesByPlayerId.size !== snapshot.participants.length) {
			return false;
		}

		const players = new Map<number, LobbyPlayer>();
		for (const participant of snapshot.participants) {
			players.set(participant.playerId, {
				playerId: participant.playerId,
				type: participant.type,
				username: participant.username,
				iconEtag: participant.iconEtag,
				isReady: true,
				isOnline: participant.type === "bot" || participant.playerId === playerId,
				seatNr: participant.seatNr
			});
		}

		const userSocketCounts = new Map<number, number>();
		userSocketCounts.set(playerId, 1);

		const lobby: LobbySession = {
			gameCode: snapshot.game.gameCode,
			sockets: new Set([ws]),
			players,
			userSocketCounts,
			metaSettings: {
				maxPlayers: snapshot.game.maxPlayers,
				minPlayers: snapshot.game.minPlayers,
				daySeconds: snapshot.game.daySeconds,
				votingSeconds: snapshot.game.votingSeconds,
				nightSeconds: snapshot.game.nightSeconds,
				tieBehavior: snapshot.game.tieBehavior,
				voteCountVisibility: snapshot.game.voteCountVisibility,
				anonymousVoting: snapshot.game.anonymousVoting,
				roleRevealOnDeath: snapshot.game.roleRevealOnDeath,
				roleDistributionMode: snapshot.game.roleDistributionMode
			},
			roleSettings: snapshot.roleSettings as RoleSettings,
			botSettings: snapshot.botSettings as BotSettings,
			status: "starting",
			createdAt: snapshot.game.createdAt.getTime(),
			lastActiveAt: Date.now()
		};

		ws.game = { id: snapshot.game.id, code: snapshot.game.gameCode };

		this.gameSessions.createFromLobby(gameId, lobby, rolesByPlayerId);
		this.gameSessions.startPhaseTimer(gameId, snapshot.game.phase ?? "day");

		return true;
	}

	public async handleMessage(ws: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		const currentGameId = ws.game?.id;
		if (currentGameId) {
			this.lobbySessions.touch(currentGameId);
			this.gameSessions.touch(currentGameId);
		}

		switch (msg.type) {
			case "CREATE_GAME":
				await this.onCreateGame(ws);
				return;
			case "JOIN_GAME":
				await this.onJoinGame(ws, msg.gameCode);
				return;
			case "LEAVE_GAME":
				await this.onLeaveGame(ws);
				return;
			case "REQUEST_LOBBY_STATE":
				await this.onRequestLobbyState(ws);
				return;
			case "CHANGE_SEAT":
				await this.onChangeSeat(ws, msg.seatNr);
				return;
			case "UPDATE_LOBBY_SETTINGS":
				await this.onUpdateLobbySettings(ws, msg.metaSettings, msg.roleSettings);
				return;
			case "ADD_BOT":
				await this.onAddBot(ws);
				return;
			case "CHANGE_BOT_SETTINGS":
				await this.onChangeBotSettings(ws, msg.botId, msg.difficulty, msg.playstyle);
				return;
			case "KICK_PLAYER":
				await this.onKickPlayer(ws, msg.playerId);
				return;
			case "SET_READY":
				await this.onSetReady(ws, msg.ready);
				return;
			case "REQUEST_GAME_STATE":
				await this.onRequestGameState(ws);
				return;
			case "PLAYER_ACTION":
				await this.onPlayerAction(ws, msg.action, msg.targetPlayerId);
				return;
			case "SEND_GAME_CHAT_MESSAGE":
				await this.onSendGameChatMessage(ws, msg.message);
				return;
			case "RECOVER_GAME":
				await this.onRecoverGame(ws);
				return;
		}
	}

	private async onCreateGame(ws: ConnectedUserSocket): Promise<void> {
		const created = await GameService.createGame();

		this.lobbySessions.create(created.id, created.gameCode, {
			maxPlayers: created.maxPlayers,
			minPlayers: created.minPlayers,
			daySeconds: created.daySeconds,
			votingSeconds: created.votingSeconds,
			nightSeconds: created.nightSeconds,
			tieBehavior: created.tieBehavior,
			voteCountVisibility: created.voteCountVisibility,
			anonymousVoting: created.anonymousVoting,
			roleRevealOnDeath: created.roleRevealOnDeath,
			roleDistributionMode: created.roleDistributionMode
		}, {});

		this.sendMessage(ws, { type: "CREATE_GAME_OK", gameCode: created.gameCode });
	}

	private async onJoinGame(ws: ConnectedUserSocket, gameCode: string): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const username = ws.userToken?.username;
		if (!playerId || !username) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const cleanGameCode = gameCode.trim();
		const game = await GameService.findByGameCode(cleanGameCode);
		if (!game) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		await this.lobbyLocks.run(game.id, async () => {
			const participant = await GameService.joinGame(playerId, game.id);
			const iconEtag = (await UserService.getIconEtag(playerId)) ?? "";

			if (!this.lobbySessions.upsertPlayer(game.id, participant, username, iconEtag, "user")) {
				await GameService.leaveGame(playerId, game.id);
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			if (!this.lobbySessions.joinSession(ws, game.id, playerId)) {
				await GameService.leaveGame(playerId, game.id);
				this.lobbySessions.removePlayer(game.id, playerId);
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			ws.game = { code: cleanGameCode, id: game.id };
			this.broadcastLobbyState(game.id);
			this.sendMessage(ws, { type: "JOIN_GAME_OK", gameCode: cleanGameCode });
		});
	}

	private async onLeaveGame(ws: ConnectedUserSocket): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			await GameService.leaveGame(playerId, gameId);

			this.lobbySessions.leaveSession(ws, gameId, playerId);

			this.lobbySessions.removePlayer(gameId, playerId);

			ws.game = undefined;
			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "LEAVE_GAME_OK" });
		});
	}

	private async onRequestLobbyState(ws: ConnectedUserSocket): Promise<void> {
		const gameId = ws.game?.id;
		if (!gameId) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		// If no lobby state, fetch it
		let state = this.lobbySessions.getLobbyState(gameId);
		if (!state) {
			if (await this.ensureLobbySession(gameId)) {
				state = this.lobbySessions.getLobbyState(gameId);
			}
		}
		if (!state) {
			if (await this.ensureInGameSession(ws, gameId)) {
				this.sendMessage(ws, { type: "GAME_STARTED", gameId, gameCode: ws.game?.code ?? "" });
				await this.onRequestGameState(ws);
				return;
			}

			throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
		}

		this.sendMessage(ws, { type: "LOBBY_STATE", data: { ...state, gameCode: ws.game?.code ?? "" } });
	}

	private async onChangeSeat(ws: ConnectedUserSocket, seatNr: number): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			await GameLobbyService.changeSeat(playerId, gameId, seatNr);

			if (!this.lobbySessions.changeSeat(gameId, playerId, seatNr)) {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "CHANGE_SEAT_OK" });
		});
	}

	private async onUpdateLobbySettings(ws: ConnectedUserSocket, metaSettings: Partial<MetaSettings>, roleSettings: RoleSettings): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			await GameLobbyService.updateLobbySettings(playerId, gameId, metaSettings);
			await RoleService.updateRoleSettings(playerId, gameId, roleSettings);

			if (!this.lobbySessions.updateMetaSettings(gameId, metaSettings)) {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			if (!this.lobbySessions.updateRoleSettings(gameId, roleSettings)) {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "UPDATE_LOBBY_SETTINGS_OK" });
		});
	}

	private async onAddBot(ws: ConnectedUserSocket): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			const botParticipant = await GameService.addBot(playerId, gameId);
			const bot = await BotService.findBotPlayerById(botParticipant.playerId);
			const botName = bot?.name ?? `Bot ${botParticipant.playerId}`;

			if (!this.lobbySessions.upsertPlayer(gameId, botParticipant, botName, "", "bot")) {
				await GameService.leaveGame(botParticipant.playerId, gameId);
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "ADD_BOT_OK" });
		});
	}

	private async onChangeBotSettings(ws: ConnectedUserSocket, botId: number, botDifficulty: BotDifficulty, botPlaystyle: BotPlaystyle): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			await GameLobbyService.updateBotSettings(playerId, gameId, botId, botDifficulty, botPlaystyle);

			if (!this.lobbySessions.updateBotSettings(gameId, botId, { difficulty: botDifficulty, playstyle: botPlaystyle })) {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "CHANGE_BOT_SETTINGS_OK" });
		});
	}

	private async onKickPlayer(ws: ConnectedUserSocket, targetPlayerId: number): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			await GameService.kickPlayer(playerId, targetPlayerId, gameId);

			// One player can have multiple sockets, thus for loop is needed to remove all of them
			for (const client of this.lobbySessions.getSockets(gameId, targetPlayerId)) {
				this.sendMessage(client, { type: "KICKED_FROM_GAME" });
				this.lobbySessions.leaveSession(client, gameId, targetPlayerId);
				client.game = undefined;
			}

			if (!this.lobbySessions.removePlayer(gameId, targetPlayerId)) {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "KICK_PLAYER_OK" });
		});
	}

	private async onSetReady(ws: ConnectedUserSocket, ready: boolean): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		const gameCode = ws.game?.code;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId || !gameCode) throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);

		await this.lobbyLocks.run(gameId, async () => {
			if (!this.lobbySessions.setReady(gameId, playerId, ready)) {
				throw new AppError(ErrorCode.PLAYER_NOT_IN_LOBBY);
			}

			this.broadcastLobbyState(gameId);
			this.sendMessage(ws, { type: "SET_READY_OK" });
		});
	}

	private broadcastLobbyState(gameId: number): void {
		const state = this.lobbySessions.getLobbyState(gameId);
		if (!state) return;

		this.broadcastToLobby(gameId, { type: "LOBBY_STATE", data: state });
	}

	private broadcastToLobby(gameId: number, message: ServerMessage): void {
		for (const client of this.lobbySessions.getSockets(gameId)) {
			this.sendMessage(client, message);
		}
	}

	private async onGameStart(gameId: number): Promise<void> {
		await this.lobbyLocks.run(gameId, async () => {
			await this.gameLocks.run(gameId, async () => {
				const lobby = this.lobbySessions.getForGameStart(gameId);
				if (!lobby) return;

				const roles = this.lobbySessions.getRoles();
				const participants = await GameService.startGame(gameId, lobby.metaSettings.minPlayers, lobby.roleSettings, lobby.metaSettings.roleDistributionMode, roles);

				this.lobbySessions.endSession(gameId);

				// Map roles by players
				const rolesById = new Map(roles.map((role) => [role.id, role]));
				const rolesByPlayerId = new Map<number, Role>();
				for (const participant of participants) {
					if (participant.roleId === null) continue;

					const role = rolesById.get(participant.roleId);
					if (!role) continue;

					rolesByPlayerId.set(participant.playerId, role);
				}

				if (rolesByPlayerId.size !== lobby.players.size) {
					const snapshot = await GameService.getInProgressGameSnapshot(gameId);
					for (const participant of snapshot?.participants ?? []) {
						if (participant.roleId === null) continue;

						const role = rolesById.get(participant.roleId);
						if (!role) continue;

						rolesByPlayerId.set(participant.playerId, role);
					}
				}
				this.gameSessions.createFromLobby(gameId, lobby, rolesByPlayerId);

				// Get only possibly existing roles
				const roleCatalog: Role[] = [];
				for (const role of roles) {
					const count = lobby.roleSettings[role.id] ?? 0;
					if (count <= 0) continue;
					roleCatalog.push(role);
				}

				const lobbyPlayers: LobbyPlayer[] = [];
				for (const player of lobby.players.values()) {
					lobbyPlayers.push(player);
				}

				// Initialize bot memory
				for (const player of lobby.players.values()) {
					if (player.type !== "bot") continue;
					await BotService.generateBotProfile(gameId, player.playerId, lobby.botSettings, lobbyPlayers, roleCatalog, rolesByPlayerId);
				}

				const startChatMessage = await ChatService.sendGameMessage({ gameId, playerId: null, message: "Game started", dayNumber: 1, phase: "day", messageType: "system" });
				this.gameSessions.addGameChatMessage(gameId, startChatMessage);
				this.gameSessions.startPhaseTimer(gameId);

				this.broadcastToGame(gameId, { type: "GAME_STARTED", gameId, gameCode: lobby.gameCode });
				this.broadcastToGame(gameId, { type: "GAME_CHAT_MESSAGE", data: startChatMessage });
			});
		});
	}

	private async onRequestGameState(ws: ConnectedUserSocket): Promise<void> {
		const gameId = ws.game?.id;
		const playerId = ws.userToken?.playerId;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId) throw new AppError(ErrorCode.GAME_NOT_FOUND);

		// If no game session, fetch it
		let gameState = this.gameSessions.getGameState(gameId, playerId);
		if (!gameState && await this.ensureInGameSession(ws, gameId)) {
			gameState = this.gameSessions.getGameState(gameId, playerId);
		}

		if (!gameState) throw new AppError(ErrorCode.GAME_NOT_FOUND);

		this.sendMessage(ws, { type: "GAME_STATE", data: { ...gameState, gameCode: ws.game?.code ?? gameState.gameCode } });
	}

	private async onPlayerAction(ws: ConnectedUserSocket, actionType: PlayerActionType, targetPlayerId: number | null): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId) throw new AppError(ErrorCode.GAME_NOT_FOUND);

		await this.gameLocks.run(gameId, async () => {
			const action: PlayerAction = { playerId, type: actionType, targetPlayerId };

			if (!this.gameSessions.submitPlayerAction(gameId, action)) {
				throw new AppError(ErrorCode.INVALID_ACTION);
			}

			this.sendMessage(ws, { type: "PLAYER_ACTION_OK" });
		});
	}

	private async onSendGameChatMessage(ws: ConnectedUserSocket, message: string): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const gameId = ws.game?.id;
		if (!playerId) throw new AppError(ErrorCode.UNAUTHORIZED);
		if (!gameId) throw new AppError(ErrorCode.GAME_NOT_FOUND);

		await this.gameLocks.run(gameId, async () => {
			const phaseAndDay = this.gameSessions.getPhaseAndDay(gameId);
			if (!phaseAndDay) throw new AppError(ErrorCode.GAME_NOT_FOUND);
			
			if (this.gameSessions.isPlayerEliminated(gameId, playerId)) {
				throw new AppError(ErrorCode.PLAYER_ELIMINATED);
			}
			
			if (phaseAndDay.currentPhase === "night") {
				throw new AppError(ErrorCode.CHAT_NOT_ALLOWED);
			}

			await this.onGameChatMessage(gameId, { gameId, playerId, message, dayNumber: phaseAndDay.dayNumber, phase: phaseAndDay.currentPhase, messageType: "player" });
		});
	}

	private async onGameChatMessage(gameId: number, message: CreateGameChatMessage): Promise<void> {
		const chatMessage = await ChatService.sendGameMessage(message);

		if (!this.gameSessions.addGameChatMessage(gameId, chatMessage)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.broadcastToGame(gameId, { type: "GAME_CHAT_MESSAGE", data: chatMessage });
	}

	private async onResolvePhase(gameId: number, phase: PhaseType, dayNumber: number, pendingActions: Map<number, PlayerAction>, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, metaSettings: MetaSettings): Promise<{ winner: FinishedGameWinner | null }> {
		return await this.gameLocks.run(gameId, async () => {
			const computed = GamePhaseService.resolvePhase(phase, pendingActions, playerStates, playerRoles, metaSettings.tieBehavior);
			const eliminatedPlayerIds = (computed.phaseResult.eliminated ?? []).map((entry) => entry.playerId);
			
			await GameService.savePhaseActions(gameId, phase, dayNumber, pendingActions);
			await GameService.setDead(gameId, eliminatedPlayerIds);

			// Hide roles if role reveal on death is disabled
			if (!metaSettings.roleRevealOnDeath && computed.phaseResult.eliminated) {
				computed.phaseResult.eliminated = computed.phaseResult.eliminated.map((entry) => ({ playerId: entry.playerId }));
			}

			if (computed.phaseResult.votes) {
				switch (metaSettings.voteCountVisibility) {
					case "never":
						delete computed.phaseResult.votes;
						break;

					default:
						computed.phaseResult.votes = computed.phaseResult.votes.map((vote) => ({
							voterPlayerId: metaSettings.anonymousVoting ? undefined : vote.voterPlayerId,
							targetPlayerId: vote.targetPlayerId
						}));
						break;
				}
			}

			await BotService.appendPhaseResultsToBots(gameId, phase, dayNumber, computed.phaseResult, computed.personalResults, pendingActions);

			this.broadcastToGame(gameId, { type: "PHASE_RESULTS", resolvedPhase: phase, dayNumber, result: computed.phaseResult });

			for (const [playerId, personalResult] of computed.personalResults) {
				if (personalResult.length === 0) continue;
				
				for (const client of this.gameSessions.getSockets(gameId, playerId)) {
					this.sendMessage(client, { type: "PERSONAL_PHASE_RESULTS", resolvedPhase: phase, dayNumber, result: personalResult });
				}
			}

			return { winner: computed.winner };
		});
	}

	private async onGameFinished(gameId: number, actionHistory: InGameDayActionHistory[], finishedWinner: FinishedGameWinner, players: GameFinishedPlayer[]): Promise<void> {
		return await this.gameLocks.run(gameId, async () => {
			await GameService.completeGame(gameId, finishedWinner.faction, finishedWinner.playerIds);

			const timeline: Array<{ playerId: number; dayNumber: number; phase: PhaseType; type: PlayerActionType; targetPlayerId: number | null; }> = [];

			for (let dayIndex = 0; dayIndex < actionHistory.length; dayIndex++) {
				const dayActions = actionHistory[dayIndex];
				const dayNumber = dayIndex + 1;

				for (const [phase, actions] of Object.entries(dayActions)) {
					for (const action of actions) {
						timeline.push({ playerId: action.playerId, dayNumber, phase: phase as PhaseType, type: action.type, targetPlayerId: action.targetPlayerId });
					}
				}
			}

			this.broadcastToGame(gameId, { type: "GAME_FINISHED", result: { winner: finishedWinner.faction, winnerPlayerIds: finishedWinner.playerIds, players, timeline }});

			this.gameSessions.endSession(gameId);
		});
	}

	private broadcastToGame(gameId: number, message: ServerMessage): void {
		for (const client of this.gameSessions.getSockets(gameId)) {
			this.sendMessage(client, message);
		}
	}

	private broadcastGameState(gameId: number): void {
		for (const client of this.gameSessions.getSockets(gameId)) {
			const playerId = client.userToken?.playerId;
			if (!playerId) continue;

			const state = this.gameSessions.getGameState(gameId, playerId);
			if (!state) continue;

			this.sendMessage(client, { type: "GAME_STATE", data: state });
		}
	}

	private async onRecoverGame(ws: ConnectedUserSocket): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const username = ws.userToken?.username;
		if (!playerId || !username) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const current = await GameService.latestActiveGameForPlayer(playerId);
		if (!current) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}

		if (current.status === "in_progress") {
			await this.gameLocks.run(current.id, async () => {
				if (!this.gameSessions.joinSession(ws, current.id, playerId) && !(await this.ensureInGameSession(ws, current.id))) {
					this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
					return;
				}

				ws.game = { code: current.gameCode, id: current.id };
				this.sendMessage(ws, { type: "RECOVER_GAME_OK", gameCode: current.gameCode, state: "inGame" });
				await this.onRequestGameState(ws);
			});
		} else {
			await this.lobbyLocks.run(current.id, async () => {
				if (!this.lobbySessions.joinSession(ws, current.id, playerId)) {
					await this.ensureLobbySession(current.id);
				}

				if (!this.lobbySessions.joinSession(ws, current.id, playerId)) {
					this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
					return;
				}

				ws.game = { code: current.gameCode, id: current.id };
				this.sendMessage(ws, { type: "RECOVER_GAME_OK", gameCode: current.gameCode, state: "lobby" });
				await this.onRequestLobbyState(ws);
			});
		}
	}

	private async botVoteAction(gameId: number, playerId: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<PlayerAction> {
		const phaseAndDay = this.gameSessions.getPhaseAndDay(gameId);

		return BotService.chooseVoteAction(gameId, playerId, phaseAndDay?.dayNumber ?? 1, players, gameChatMessages, timeoutMs);
	}

	private async botNightAction(gameId: number, playerId: number, actionState: BotNightActionState, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<PlayerAction> {
		const phaseAndDay = this.gameSessions.getPhaseAndDay(gameId);

		return BotService.chooseNightAction(gameId, playerId, { ...actionState, dayNumber: phaseAndDay?.dayNumber ?? actionState.dayNumber }, players, gameChatMessages, timeoutMs);
	}

	private async botChatAction(gameId: number, playerId: number, players: GameStatePlayer[], gameChatMessages: ResponseGameChatMessage[], timeoutMs: number): Promise<CreateGameChatMessage | null> {
		const phaseAndDay = this.gameSessions.getPhaseAndDay(gameId);

		return BotService.createDiscussionMessage(gameId, playerId, phaseAndDay?.currentPhase ?? "day", phaseAndDay?.dayNumber ?? 1, players, gameChatMessages, timeoutMs);
	}
}
