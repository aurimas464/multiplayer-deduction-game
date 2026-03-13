import type { ConnectedUserSocket, LobbyStateData, GameSession } from "../types/websocket";
import type { Participant } from "../types/entities/participant";
import type { MetaSettings, RoleSettings, SessionPlayer } from "../types/websocket";

type LobbyChangedFn = (gameId: number) => void;

export class WebSocketGameSession {
	private sessions = new Map<number, GameSession>();
	private timer?: NodeJS.Timeout;

	private readonly cleanupIntervalMs = 10_000;
	private readonly staleSessionMs = this.cleanupIntervalMs * 60;

	public constructor(private readonly onLobbyChanged: LobbyChangedFn) {}

	private notify(gameId: number): void {
		try {
			this.onLobbyChanged(gameId);
		} catch {
			// ignore
		}
	}

	private incUserSocket(session: GameSession, playerId: number): number {
		const next = (session.userSocketCounts.get(playerId) ?? 0) + 1;
		session.userSocketCounts.set(playerId, next);
		return next;
	}

	private decUserSocket(session: GameSession, playerId: number): number {
		const prev = session.userSocketCounts.get(playerId) ?? 0;
		const next = Math.max(0, prev - 1);
		if (next === 0) session.userSocketCounts.delete(playerId);
		else session.userSocketCounts.set(playerId, next);
		return next;
	}

	public start(): void {
		if (this.timer) return;

		this.timer = setInterval(() => {
			const now = Date.now();

            for (const [gameId, session] of this.sessions) {
                // Track empty sessions
				if (session.sockets.size > 0) {
					session.emptySince = undefined;
				} else if (session.emptySince === undefined) {
					session.emptySince = now;
				}

				// Cleanup stale/empty sessions
				const emptyTooLong = session.emptySince ? now - session.emptySince > this.cleanupIntervalMs * 5 : false;
				const staleTooLong = now - session.lastActiveAt > this.staleSessionMs;

				if (emptyTooLong || staleTooLong) {
					this.sessions.delete(gameId);
				}
			}
		}, this.cleanupIntervalMs);

		this.timer.unref?.();
	}

	public stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}

	public get(gameId: number): GameSession | undefined {
		return this.sessions.get(gameId);
	}

	public create(gameId: number, metaSettings: MetaSettings, roleSettings: RoleSettings): GameSession {
		const existing = this.sessions.get(gameId);
		if (existing) {
			existing.metaSettings = { ...metaSettings };
			existing.roleSettings = { ...roleSettings };
			return existing;
		}

		const now = Date.now();
		const session: GameSession = {
			metaSettings,
			roleSettings,
			sockets: new Set(),
			players: new Map(),
			userSocketCounts: new Map(),
			createdAt: now,
			lastActiveAt: now,
		};

		this.sessions.set(gameId, session);
		return session;
	}

	public touch(gameId: number, playerId?: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const now = Date.now();
		session.lastActiveAt = now;

		if (!playerId) return true;

		const player = session.players.get(playerId);
		if (!player) return true;

		player.lastSeenAt = now;
		return true;
	}

	public joinSession(ws: ConnectedUserSocket, gameId: number): GameSession | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const prevGameId = ws.game?.[1];
		if (prevGameId && prevGameId !== gameId) {
			this.leaveSession(ws);
		}

		const now = Date.now();

		session.sockets.add(ws);
		session.lastActiveAt = now;
		session.emptySince = undefined;

		const playerId = ws.userToken?.playerId;
		if (playerId) {
			const count = this.incUserSocket(session, playerId);
			if (count === 1) {
				const player = session.players.get(playerId);
				if (player) {
					player.isOnline = true;
					player.lastSeenAt = now;
				}
			}
		}

		this.notify(gameId);
		return session;
	}

	public leaveSession(ws: ConnectedUserSocket): boolean {
		const gameId = ws.game?.[1];
		if (!gameId) return false;

		ws.game = undefined;

		const session = this.sessions.get(gameId);
		if (!session) return false;

		const removed = session.sockets.delete(ws);
		if (!removed) return false;

		const now = Date.now();
		session.lastActiveAt = now;

		if (session.sockets.size === 0 && session.emptySince === undefined) {
			session.emptySince = now;
		}

		const playerId = ws.userToken?.playerId;
		if (playerId) {
			const remaining = this.decUserSocket(session, playerId);
			if (remaining === 0) {
				const player = session.players.get(playerId);
				if (player) {
					player.isOnline = false;
					player.lastSeenAt = now;
				}
			}
		}

		this.notify(gameId);
		return true;
	}

	public upsertPlayer(gameId: number, participant: Participant, username: string, iconEtag: string, type: SessionPlayer["type"] = "user"): SessionPlayer | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const now = Date.now();

		let player = session.players.get(participant.playerId);
		if (player) {
			player.type = type;
			player.username = username;
			player.iconEtag = iconEtag;
			player.seatNr = participant.seatNr;
			player.lastSeenAt = now;
			session.lastActiveAt = now;

			let isOnline = true;
			if (type === "user") {
				const count = session.userSocketCounts.get(participant.playerId) ?? 0;
				isOnline = count > 0;
			}
			player.isOnline = isOnline;
		} else {
			let isOnline = true;
			if (type === "user") {
				const count = session.userSocketCounts.get(participant.playerId) ?? 0;
				isOnline = count > 0;
			}

			player = {
				type,
				username,
				playerId: participant.playerId,
				iconEtag,
				isReady: false,
				seatNr: participant.seatNr,
				joinedAt: now,
				isOnline,
				lastSeenAt: now,
			};

			session.players.set(participant.playerId, player);
			session.lastActiveAt = now;
		}

		this.notify(gameId);
		return player;
	}

	public updateMetaSettings(gameId: number, patch: Partial<MetaSettings>): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.metaSettings = {
			...session.metaSettings,
			...patch,
		};

		session.lastActiveAt = Date.now();
		this.notify(gameId);
		return true;
	}

	public updateRoleSettings(gameId: number, patch: RoleSettings): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		for (const [roleId, count] of Object.entries(patch)) {
			session.roleSettings[Number(roleId)] = count;
		}

		session.lastActiveAt = Date.now();
		this.notify(gameId);
		return true;
	}
	
	public setReady(gameId: number, playerId: number, isReady: boolean): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const player = session.players.get(playerId);
		if (!player) return false;

		player.isReady = isReady;
		session.lastActiveAt = Date.now();

		this.notify(gameId);
		return true;
	}

	public removePlayer(gameId: number, playerId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.players.delete(playerId);
		session.userSocketCounts.delete(playerId);
		session.lastActiveAt = Date.now();

		this.notify(gameId);
		return true;
	}

	public changeSeat(gameId: number, playerId: number, newSeatNr: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		const player = session.players.get(playerId);
		if (!player) return false;

		for (const p of session.players.values()) {
			if (p.playerId !== playerId && p.seatNr === newSeatNr) {
				return false;
			}
		}

		player.seatNr = newSeatNr;
		session.lastActiveAt = Date.now();

		this.notify(gameId);
		return true;
	}

	public getLobbySnapshot(gameId: number): LobbyStateData | null {
		const session = this.sessions.get(gameId);
		if (!session) return null;

		const snapshot: LobbyStateData = {
			players: Array.from(session.players.values()).map((p) => ({
				playerId: p.playerId,
				username: p.username,
				iconEtag: p.iconEtag,
				isReady: p.isReady,
				isOnline: p.isOnline,
				lastSeenAt: p.lastSeenAt,
				seatNr: p.seatNr,
			})),
			metaSettings: { ...session.metaSettings },
			roleSettings: { ...session.roleSettings },
		};

		snapshot.players.sort((a, b) => a.seatNr - b.seatNr);

		return snapshot;
	}
}