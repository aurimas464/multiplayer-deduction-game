import type { ConnectedUserSocket, LobbyStateData } from "../types/websocket";
import type { Seat } from "../types/entities/seat";

export type SessionPlayer = {
	type: "user" | "bot";
	playerId: number;
	username: string;
	isReady: boolean;
	seatNr: number;
	iconEtag: string;

	joinedAt: number;

	isOnline: boolean;
	lastSeenAt: number;
};


export type GameSession = {
	gameCode: string;

	sockets: Set<ConnectedUserSocket>;
	players: Map<number, SessionPlayer>;
	userSocketCounts: Map<number, number>;
	createdAt: number;
	lastActiveAt: number;
	emptySince?: number;

	maxPlayers: number;
	minPlayers: number;
};

type LobbyChangedFn = (gameCode: string) => void;

export class WebSocketGameSession {
	private sessions = new Map<string, GameSession>();
	private timer?: NodeJS.Timeout;

	private readonly cleanupIntervalMs = 10_000;
	private readonly staleSessionMs = this.cleanupIntervalMs * 60;

	public constructor(private readonly onLobbyChanged: LobbyChangedFn) {}

	private notify(gameCode: string): void {
		try {
			this.onLobbyChanged(gameCode);
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

			for (const [code, session] of this.sessions) {
				// Track empty sessions
				if (session.sockets.size > 0) {
					session.emptySince = undefined;
				} else if (session.emptySince === undefined) {
					session.emptySince = now;
				}

				let changed = false;

				// Cleanup stale/empty sessions
				const emptyTooLong = session.emptySince ? now - session.emptySince > this.cleanupIntervalMs * 5 : false;
				const staleTooLong = now - session.lastActiveAt > this.staleSessionMs;

				if (emptyTooLong || staleTooLong) {
					this.sessions.delete(code);
					continue;
				}

				if (changed) {
					this.notify(code);
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

	public get(gameCode: string): GameSession | undefined {
		return this.sessions.get(gameCode);
	}

	public create(gameCode: string, maxPlayers: number, minPlayers: number): GameSession {
		const existing = this.sessions.get(gameCode);
		if (existing) {
			existing.maxPlayers = maxPlayers;
			existing.minPlayers = minPlayers;
			return existing;
		}

		const now = Date.now();
		const session: GameSession = {
			gameCode,
			maxPlayers,
			minPlayers,
			sockets: new Set(),
			players: new Map(),
			userSocketCounts: new Map(),
			createdAt: now,
			lastActiveAt: now,
		};

		this.sessions.set(gameCode, session);
		return session;
	}

	public touch(gameCode: string, playerId?: number): boolean {
		const session = this.sessions.get(gameCode);
		if (!session) return false;

		const now = Date.now();
		session.lastActiveAt = now;

		if (!playerId) return true;

		const player = session.players.get(playerId);
		if (!player) return true;

		player.lastSeenAt = now;
		return true;
	}

	public joinSession(ws: ConnectedUserSocket, gameCode: string): GameSession | null {
		const session = this.sessions.get(gameCode);
		if (!session) return null;

		const prevCode = ws.gameCode;
		if (prevCode && prevCode !== gameCode) {
			this.leaveSession(ws);
		}

		const now = Date.now();

		ws.gameCode = gameCode;
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

		this.notify(gameCode);
		return session;
	}

	public leaveSession(ws: ConnectedUserSocket): boolean {
		const code = ws.gameCode;
		if (!code) return false;

		ws.gameCode = undefined;

		const session = this.sessions.get(code);
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

		this.notify(code);
		return true;
	}

	public upsertPlayer(gameCode: string, seat: Seat, username: string, iconEtag: string, type: SessionPlayer["type"] = "user"): SessionPlayer | null {
		const session = this.sessions.get(gameCode);
		if (!session) return null;

		const now = Date.now();

		let player = session.players.get(seat.playerId);
		if (player) {
			player.type = type;
			player.username = username;
			player.iconEtag = iconEtag;
			player.seatNr = seat.number;
			player.lastSeenAt = now;
			session.lastActiveAt = now;

			if (type === "user") {
				const count = session.userSocketCounts.get(seat.playerId) ?? 0;
				player.isOnline = count > 0;
			} else {
				player.isOnline = true;
			}
		} else {
			let isOnline = true;
			if(type === "user") {
				isOnline = (session.userSocketCounts.get(seat.playerId) ?? 0) > 0;
			}

			player = {
				type,
				username,
				playerId: seat.playerId,
				iconEtag,
				isReady: false,
				seatNr: seat.number,
				joinedAt: now,
				isOnline,
				lastSeenAt: now,
			};

			session.players.set(seat.playerId, player);
			session.lastActiveAt = now;
		}

		this.notify(gameCode);
		return player;
	}

	public setMaxPlayers(gameCode: string, maxPlayers: number): boolean {
		const session = this.sessions.get(gameCode);
		if (!session) return false;

		session.maxPlayers = maxPlayers;
		session.lastActiveAt = Date.now();
		this.notify(gameCode);
		return true;
	}

	public setReady(gameCode: string, playerId: number, isReady: boolean): boolean {
		const session = this.sessions.get(gameCode);
		if (!session) return false;

		const player = session.players.get(playerId);
		if (!player) return false;

		player.isReady = isReady;
		session.lastActiveAt = Date.now();

		this.notify(gameCode);
		return true;
	}

	public removePlayer(gameCode: string, playerId: number): boolean {
		const session = this.sessions.get(gameCode);
		if (!session) return false;

		const player = session.players.get(playerId);

		session.players.delete(playerId);
		session.userSocketCounts.delete(playerId);

		session.lastActiveAt = Date.now();

		this.notify(gameCode);
		return true;
	}

	public changeSeat(gameCode: string, playerId: number, newSeatNr: number): boolean {
		const session = this.sessions.get(gameCode);
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

		this.notify(gameCode);
		return true;
	}

	public getLobbySnapshot(gameCode: string): LobbyStateData | null {
		const session = this.sessions.get(gameCode);
		if (!session) return null;

		const players: LobbyStateData["players"] = [];

		for (const p of session.players.values()) {
			players.push({
				playerId: p.playerId,
				username: p.username,
				iconEtag: p.iconEtag,
				isReady: p.isReady,
				isOnline: p.isOnline,
				lastSeenAt: p.lastSeenAt,
				seatNr: p.seatNr,
			});
		}

		players.sort((a, b) => a.seatNr - b.seatNr);

		return {
			players,
			maxPlayers: session.maxPlayers,
			minPlayers: session.minPlayers,
		};
	}
}