import { AppError, ErrorCode } from "../types";
import type { ConnectedUserSocket, ClientMessage, ServerMessage, MetaSettings, RoleSettings } from "../types/websocket";
import { WebSocketGameSession } from "./WebSocketGameSession";
import GameService from "../services/gameService";
import UserService from "../services/userService";
import GameLobbyService from "../services/gameLobbyService";
import RoleService from "../services/roleService";

export class WebSocketGame {
	private readonly sessions: WebSocketGameSession;

	public constructor(private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) {
		this.sessions = new WebSocketGameSession((gameId) => this.broadcastLobbyState(gameId));
		this.sessions.start();
	}

	private async ensureSession(gameId: number) {
		const session = this.sessions.get(gameId);
		if (session) return session;

		const lobby = await GameService.getLobbyMeta(gameId);
		if (!lobby) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		return this.sessions.create(lobby.id, {
			maxPlayers: lobby.maxPlayers,
			minPlayers: lobby.minPlayers,
			daySeconds: lobby.daySeconds,
			votingSeconds: lobby.votingSeconds,
			nightSeconds: lobby.nightSeconds,
			tieBehavior: lobby.tieBehavior,
			voteCountVisibility: lobby.voteCountVisibility,
			anonymousVoting: lobby.anonymousVoting,
			roleRevealOnDeath: lobby.roleRevealOnDeath,
			roleDistributionMode: lobby.roleDistributionMode
		}, {});
	}

	public track(ws: ConnectedUserSocket): void {
		ws.game = undefined;

		ws.once("close", () => {
			this.sessions.leaveSession(ws);
		});
	}

	public async handleMessage(ws: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		const [, currentGameId] = ws.game ?? [undefined, undefined];
		if (currentGameId && ws.userToken?.playerId) {
			this.sessions.touch(currentGameId, ws.userToken.playerId);
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

			case "RECOVER_GAME":
				await this.onRecoverGame(ws);
				return;

			case "CHANGE_SEAT":
				await this.onChangeSeat(ws, msg.seatNr);
				return;

			case "SET_READY":
				await this.onSetReady(ws, msg.ready);
				return;

			case "UPDATE_LOBBY_SETTINGS":
				await this.onUpdateLobbySettings(ws, msg.metaSettings, msg.roleSettings);
				return;

			case "KICK_PLAYER":
				await this.onKickPlayer(ws, msg.playerId);
				return;
		}
	}

	private async onCreateGame(ws: ConnectedUserSocket): Promise<void> {
		const created = await GameService.createGame();
        if (created) {
			this.sessions.create(created.id, {
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
			this.sendMessage(ws, { type: "CREATE_GAME_OK", gameCode: created.gameCode } as ServerMessage);
		} else {
			throw new AppError(ErrorCode.GAME_NOT_CREATED);
		}
	}

	private async onJoinGame(ws: ConnectedUserSocket, gameCode: string): Promise<void> {
		const code = gameCode.trim();
		const playerId = ws.userToken?.playerId;
		const username = ws.userToken?.username;
		if (!playerId || !username) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const participant = await GameService.joinGame(playerId, code);
		const iconEtag = await UserService.getIconEtag(playerId);

		await this.ensureSession(participant.gameId);
		if (!this.sessions.upsertPlayer(participant.gameId, participant, username, iconEtag ?? "")) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		if (!this.sessions.joinSession(ws, participant.gameId)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		ws.game = [code, participant.gameId];
		this.sendMessage(ws, { type: "JOIN_GAME_OK", gameCode: code });
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

		const participant = await GameService.findByGameIdAndPlayerId(current.id, playerId);
		if (!participant) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}

		const iconEtag = await UserService.getIconEtag(playerId);

		await this.ensureSession(current.id);
		if (!this.sessions.upsertPlayer(current.id, participant, username, iconEtag ?? "")) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}
		if (!this.sessions.joinSession(ws, current.id)) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}

		ws.game = [current.gameCode, participant.gameId];
		this.sendMessage(ws, { type: "RECOVER_GAME_OK", gameCode: current.gameCode });
	}

	private async onLeaveGame(ws: ConnectedUserSocket): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const game = ws.game;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		if (!game) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		const [, gameId] = game;

		await GameService.leaveGame(playerId, gameId);

		this.sessions.removePlayer(gameId, playerId);
		this.sessions.leaveSession(ws);

		this.sendMessage(ws, { type: "LEAVE_GAME_OK" });
	}

	private async onChangeSeat(ws: ConnectedUserSocket, seatNr: number): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const game = ws.game;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		if (!game) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}
		const [, gameId] = game;

		await GameLobbyService.changeSeat(playerId, gameId, seatNr);

		const participant = await GameService.findByGameIdAndPlayerId(gameId, playerId);
		if (!participant) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}

		await this.ensureSession(gameId);
		if (!this.sessions.changeSeat(gameId, participant.playerId, seatNr)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "CHANGE_SEAT_OK" });
	}

	private async onSetReady(ws: ConnectedUserSocket, ready: boolean): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const game = ws.game;
		if (!game) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		const [, gameId] = game;

		await this.ensureSession(gameId);
		if (!this.sessions.setReady(gameId, playerId, ready)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "SET_READY_OK" });
	}

	private async onUpdateLobbySettings(ws: ConnectedUserSocket, metaSettings: Partial<MetaSettings>, roleSettings: RoleSettings): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const game = ws.game;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		if (!game) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}
		const [, gameId] = game;

		const updatedLobby = await GameLobbyService.updateLobbySettings(playerId, gameId, metaSettings);
		if (!updatedLobby) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		const updatedRole = await RoleService.updateRoleSettings(playerId, gameId, roleSettings);
		if (!updatedRole) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		await this.ensureSession(gameId);
		if (!this.sessions.updateMetaSettings(gameId, metaSettings)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		if (!this.sessions.updateRoleSettings(gameId, roleSettings)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "UPDATE_LOBBY_SETTINGS_OK" });
	}

	private async onRequestLobbyState(ws: ConnectedUserSocket): Promise<void> {
		const game = ws.game;
		if (!game) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}
		const [, gameId] = game;

		await this.ensureSession(gameId);
		const snapshot = this.sessions.getLobbySnapshot(gameId);
		if (!snapshot) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "LOBBY_STATE", data: snapshot });
	}

	private async onKickPlayer(ws: ConnectedUserSocket, targetPlayerId: number): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const game = ws.game;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}
		if (!game) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}
		const [, gameId] = game;

		await GameService.kickPlayer(playerId, targetPlayerId, gameId);

		const session = this.sessions.get(gameId);
		if (session) {
			for (const clientSocket of session.sockets) {
				if (clientSocket.userToken?.playerId === targetPlayerId) {
					this.sendMessage(clientSocket, { type: "KICKED_FROM_GAME" });
					this.sessions.leaveSession(clientSocket);
					break;
				}
			}
		}

		await this.ensureSession(gameId);
		if (!this.sessions.removePlayer(gameId, targetPlayerId)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "KICK_PLAYER_OK" });
	}

	private broadcastLobbyState(gameId: number): void {
		const session = this.sessions.get(gameId);
		if (!session) return;

		const snapshot = this.sessions.getLobbySnapshot(gameId);
		if (!snapshot) return;

		const payload: ServerMessage = { type: "LOBBY_STATE", data: snapshot };

		for (const client of session.sockets) {
			if (client.readyState !== 1) continue;

			try {
				this.sendMessage(client, payload);
			} catch {
				// ignore
			}
		}
	}
}