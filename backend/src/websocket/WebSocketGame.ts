import { AppError, ErrorCode } from "../types";
import type { ConnectedUserSocket, ClientMessage, ServerMessage } from "../types/websocket";
import { WebSocketGameSession } from "./WebSocketGameSession";
import GameService from "../services/gameService";
import UserService from "../services/userService";
import GameLobbyService from "../services/gameLobbyService";

export class WebSocketGame {
	private readonly sessions: WebSocketGameSession;

	public constructor(private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) {
		this.sessions = new WebSocketGameSession((gameCode) => this.broadcastLobbyState(gameCode));
		this.sessions.start();
	}

	private async ensureSession(gameCode: string) {
		let session = this.sessions.get(gameCode);
		if (session) return session;

		const lobby = await GameService.getLobbyMeta(gameCode);
		if (!lobby) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		return this.sessions.create(gameCode, lobby.maxPlayers, lobby.minPlayers);
	}

	public track(ws: ConnectedUserSocket): void {
		ws.gameCode = undefined;

		ws.once("close", () => {
			this.sessions.leaveSession(ws);
		});
	}

	public async handleMessage(ws: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		if (ws.gameCode && ws.userToken?.playerId) {
			this.sessions.touch(ws.gameCode, ws.userToken.playerId);
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
		}
	}

	private async onCreateGame(ws: ConnectedUserSocket): Promise<void> {
		const created = await GameService.createGame();
		if (created) {
			this.sessions.create(created.gameCode, created.maxPlayers, created.minPlayers);
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

		const seat = await GameService.joinGame(playerId, code);
		const iconEtag = await UserService.getIconEtag(playerId);

		await this.ensureSession(code);
		if (!this.sessions.upsertPlayer(code, seat, username, iconEtag ?? "")) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}
		if (!this.sessions.joinSession(ws, code)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

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

		const seat = await GameService.findByGameCodeAndPlayerId(current.gameCode, playerId);
		if (!seat) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}

		const iconEtag = await UserService.getIconEtag(playerId);

		await this.ensureSession(current.gameCode);
		if (!this.sessions.upsertPlayer(current.gameCode, seat, username, iconEtag ?? "")) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}
		if (!this.sessions.joinSession(ws, current.gameCode)) {
			this.sendMessage(ws, { type: "RECOVER_GAME_NONE" });
			return;
		}

		this.sendMessage(ws, { type: "RECOVER_GAME_OK", gameCode: current.gameCode });
	}

	private async onLeaveGame(ws: ConnectedUserSocket): Promise<void> {
		const playerId = ws.userToken?.playerId;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const code = ws.gameCode;
		if (!code) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		await GameService.leaveGame(playerId, code);

		this.sessions.removePlayer(code, playerId);
		this.sessions.leaveSession(ws);

		this.sendMessage(ws, { type: "LEAVE_GAME_OK" });
	}

	private async onChangeSeat(ws: ConnectedUserSocket, seatNr: number): Promise<void> {
		const playerId = ws.userToken?.playerId;
		const username = ws.userToken?.username;
		if (!playerId || !username) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const code = ws.gameCode;
		if (!code) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}

		await GameLobbyService.changeSeat(playerId, code, seatNr);

		const seat = await GameService.findByGameCodeAndPlayerId(code, playerId);
		if (!seat) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}

		await this.ensureSession(code);
		if (!this.sessions.changeSeat(code, seat.playerId, seatNr)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "CHANGE_SEAT_OK" });
	}

	private async onRequestLobbyState(ws: ConnectedUserSocket): Promise<void> {
		const code = ws.gameCode;
		if (!code) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}

		await this.ensureSession(code);
		const snapshot = this.sessions.getLobbySnapshot(code);
		if (!snapshot) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "LOBBY_STATE", data: snapshot });
	}

	private broadcastLobbyState(gameCode: string): void {
		const session = this.sessions.get(gameCode);
		if (!session) return;

		const snapshot = this.sessions.getLobbySnapshot(gameCode);
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

	private async onSetReady(ws: ConnectedUserSocket, ready: boolean): Promise<void> {
		const playerId = ws.userToken?.playerId;
		if (!playerId) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		const code = ws.gameCode;
		if (!code) {
			throw new AppError(ErrorCode.NOT_IN_LOBBY);
		}

		await this.ensureSession(code);
		if (!this.sessions.setReady(code, playerId, ready)) {
			throw new AppError(ErrorCode.GAME_NOT_FOUND);
		}

		this.sendMessage(ws, { type: "SET_READY_OK" });
	}
}