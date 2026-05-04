import { WSBaseSessionManager } from "./WSBaseSessionManager";
import type { BotSettings, ConnectedUserSocket, LobbyPlayer, LobbySession, LobbyStateData, MetaSettings, RoleSettings } from "../../../types/websocket/types";
import type { Participant } from "../../../types/entities/participant";
import type { PlayerType } from "../../../types/entities/player";
import type { Role } from "../../../types/entities/role";

export class WSLobbySessionManager extends WSBaseSessionManager<LobbySession> {
	private roles: Role[] = [];

	private readonly startDelayMs = 10_000;

	public constructor(
		private readonly onGetRoles: () => Promise<Role[]>,
		onGameCancelled: (gameId: number) => Promise<void>,
		private readonly onGameStarting: (gameId: number, startsAt: number) => void,
		private readonly onGameStartCancelled: (gameId: number) => void,
		private readonly onGameStart: (gameId: number) => Promise<void>
	) {
		super(onGameCancelled);
	}

	public async start(): Promise<void> {
		if (this.timer) return;

		// Cache roles
		this.roles = await this.onGetRoles();

		// Periodically removes sessions that are empty or inactive for too long
		this.timer = setInterval(() => {
			for (const gameId of this.getExpiredGameIds()) {
				const session = this.sessions.get(gameId);
				if (!session) continue;

				this.clearStartTimer(session);
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
			this.clearStartTimer(session);
		}

		await this.cancelAllSessions();
		this.sessions.clear();
	}

	public getRoles(): Role[] {
		return this.roles;
	}

	public create(gameId: number, gameCode: string, metaSettings: MetaSettings, roleSettings: RoleSettings = {}, botSettings: BotSettings = {}): void {
		const now = Date.now();

		const existing = this.sessions.get(gameId);
		if (existing) {
			this.clearStartTimer(existing);

			existing.gameCode = gameCode;
			existing.metaSettings = { ...metaSettings };
			existing.roleSettings = { ...roleSettings };
			existing.botSettings = { ...botSettings };
			existing.status = "lobby";
			existing.lastActiveAt = now;
		}

		const session: LobbySession = {
			gameCode,
			sockets: new Set(),
			players: new Map(),
			userSocketCounts: new Map(),
			metaSettings: { ...metaSettings },
			roleSettings: { ...roleSettings },
			botSettings: { ...botSettings },
			status: "lobby",
			createdAt: now,
			lastActiveAt: now
		};

		this.sessions.set(gameId, session);
	}

	// Adds socket to lobby session
	public joinSession(ws: ConnectedUserSocket, gameId: number, playerId: number): LobbySession | null {
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

	// Removes socket from lobby session
	public leaveSession(ws: ConnectedUserSocket, gameId: number, playerId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const removed = session.sockets.delete(ws);
		if (!removed) return false;

		const next = (session.userSocketCounts.get(playerId) ?? 0) - 1;
		
		// If no sockets, mark player as offline and reset readiness
		if (next <= 0) {
			session.userSocketCounts.delete(playerId);

			const player = session.players.get(playerId);
			if (player) {
				player.isOnline = false;

				if (player.type === "user") {
					player.isReady = false;
				}
			}

			this.checkAndManageGameTimer(gameId);
		} else {
			session.userSocketCounts.set(playerId, next);
		}
		
		return true;
	}

	public upsertPlayer(gameId: number, participant: Participant, username: string, iconEtag: string, type: PlayerType): LobbyPlayer | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const existing = session.players.get(participant.playerId);
		const socketCount = type === "user" ? (session.userSocketCounts.get(participant.playerId) ?? 0) : 0;

		const player: LobbyPlayer = {
			playerId: participant.playerId,
			type,
			username,
			iconEtag,
			isReady: type === "bot" ? true : (existing?.isReady ?? false),
			isOnline: type === "bot" ? true : socketCount > 0,
			seatNr: participant.seatNr
		};

		session.players.set(participant.playerId, player);

		this.checkAndManageGameTimer(gameId);
		return player;
	}

	public removePlayer(gameId: number, playerId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.players.delete(playerId);
		session.userSocketCounts.delete(playerId);

		this.checkAndManageGameTimer(gameId);
		return true;
	}

	public changeSeat(gameId: number, playerId: number, seatNr: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const player = session.players.get(playerId);
		if (!player) return false;

		for (const existing of session.players.values()) {
			if (existing.playerId !== playerId && existing.seatNr === seatNr) {
				return false;
			}
		}

		player.seatNr = seatNr;

		return true;
	}

	public updateMetaSettings(gameId: number, patch: Partial<MetaSettings>): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.metaSettings = {
			...session.metaSettings,
			...patch
		};

		this.checkAndManageGameTimer(gameId);
		return true;
	}

	public updateRoleSettings(gameId: number, patch: RoleSettings): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.roleSettings = {
			...session.roleSettings,
			...patch
		};

		this.checkAndManageGameTimer(gameId);
		return true;
	}

	public updateBotSettings(gameId: number, botPlayerId: number, settings: BotSettings[number]): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const player = session.players.get(botPlayerId);
		if (!player || player.type !== "bot") return false;
		
		session.botSettings = {
			...session.botSettings,
			[botPlayerId]: { ...settings }
		};

		return true;
	}

	public setReady(gameId: number, playerId: number, ready: boolean): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const player = session.players.get(playerId);
		if (!player || player.type === "bot" || !player.isOnline) return false;

		player.isReady = ready;

		this.checkAndManageGameTimer(gameId);
		return true;
	}

	public getLobbyState(gameId: number): LobbyStateData | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		return {
			gameCode: session.gameCode,
			gameId,
			players: Array.from(session.players.values()).map((player) => ({
				playerId: player.playerId,
				type: player.type,
				username: player.username,
				iconEtag: player.iconEtag,
				isReady: player.isReady,
				isOnline: player.isOnline,
				seatNr: player.seatNr
			})).sort((a, b) => a.seatNr - b.seatNr),
			metaSettings: { ...session.metaSettings },
			roleSettings: { ...session.roleSettings },
			botSettings: { ...session.botSettings }
		};
	}

	public checkAndManageGameTimer(gameId: number): void {
		const session = this.sessions.get(gameId);
		if (!session) return;

		const allReady = this.checkAllReady(session);

		if (allReady && session.status === "lobby" && !session.startTimer) {
			this.startGameTimer(gameId, session);
			return;
		}

		if (!allReady && session.startTimer) {
			this.cancelGameTimer(gameId, session);
		}
	}

	private checkAllReady(session: LobbySession): boolean {
		if (session.players.size < session.metaSettings.minPlayers) return false;
		if (session.players.size > session.metaSettings.maxPlayers) return false;

		for (const player of session.players.values()) {
			if (!player.isReady) return false;
			if (player.type === "user" && !player.isOnline) return false;
		}

		return this.validateRoleSettings(session);
	}

	private startGameTimer(gameId: number, session: LobbySession): void {
		session.status = "starting";
		session.gameStartingAt = Date.now() + this.startDelayMs;

		session.startTimer = setTimeout(() => {
			const currentSession = this.sessions.get(gameId);
			if (!currentSession) return;

			currentSession.startTimer = undefined;
			currentSession.gameStartingAt = undefined;

			if (!this.checkAllReady(currentSession)) {
				currentSession.status = "lobby";
				this.onGameStartCancelled(gameId);
				return;
			}

			void Promise.resolve(this.onGameStart(gameId)).catch((err) => {
				if (process.env.NODE_ENV === "development") {
					console.error("Game start failed", err);
				}

				const sessionAfterError = this.sessions.get(gameId);
				if (!sessionAfterError) return;

				sessionAfterError.status = "lobby";
				this.onGameStartCancelled(gameId);
			});
		}, this.startDelayMs);

		session.startTimer.unref?.();

		this.onGameStarting(gameId, session.gameStartingAt);
	}

	private cancelGameTimer(gameId: number, session: LobbySession): void {
		this.clearStartTimer(session);

		session.status = "lobby";
		this.onGameStartCancelled(gameId);
	}

	private clearStartTimer(session: LobbySession): void {
		session.gameStartingAt = undefined;

		if (session.startTimer) {
			clearTimeout(session.startTimer);
			session.startTimer = undefined;
		}
	}

	private validateRoleSettings(session: LobbySession): boolean {
		switch (session.metaSettings.roleDistributionMode) {
			// The role amount needs to match the player count
			case "exact": {
				let communeCount = 0;
				let neutralCount = 0;
				let vampireCount = 0;

				for (const role of this.roles) {
					const count = session.roleSettings[role.id] ?? 0;
					if (count <= 0) continue;

					switch (role.alignment) {
						case "commune":
							communeCount += count;
							break;
						case "neutral":
							neutralCount += count;
							break;
						case "vampire":
							vampireCount += count;
							break;
					}
				}

				if (communeCount + neutralCount + vampireCount !== session.players.size) {
					return false;
				}

				if (communeCount <= 0 || vampireCount <= 0) {
					return false;
				}

				return communeCount + neutralCount > vampireCount;
			}
			// At least one commune and vampire role must be selected
			case "weighted_random": {
				let hasCommune = false;
				let hasVampire = false;

				for (const role of this.roles) {
					const count = session.roleSettings[role.id] ?? 0;
					if (count <= 0) continue;

					switch (role.alignment) {
						case "commune":
							hasCommune = true;
							break;
						case "vampire":
							hasVampire = true;
							break;
					}

					if (hasCommune && hasVampire) {
						return true;
					}
				}

				return false;
			}
		}
	}
	
	public getForGameStart(gameId: number): LobbySession | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		return session;
	}

	public endSession(gameId: number): void {
		const session = this.sessions.get(gameId);
		if (!session) return;
		
		this.clearStartTimer(session);
		this.sessions.delete(gameId);
	}
}
