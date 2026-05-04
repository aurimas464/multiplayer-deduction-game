import type { BaseSession, ConnectedUserSocket } from "../../../types/websocket/types";

export abstract class WSBaseSessionManager<TSession extends BaseSession> {
	protected readonly sessions = new Map<number, TSession>();

	protected timer?: ReturnType<typeof setTimeout>;
	protected readonly cleanupIntervalMs = 10_000;
	protected readonly staleSessionMs = this.cleanupIntervalMs * 60;
	protected readonly emptySessionMs = this.cleanupIntervalMs * 5;

	protected constructor(
		protected readonly onGameCancelled: (gameId: number) => Promise<void>
	) {}

	public exists(gameId: number): boolean {
		return this.sessions.has(gameId);
	}

	public touch(gameId: number): boolean {
		const session = this.sessions.get(gameId);
		if (!session) return false;

		session.lastActiveAt = Date.now();
		return true;
	}

	public getSockets(gameId: number, playerId?: number): ConnectedUserSocket[] {
		const session = this.sessions.get(gameId);
		if (!session) return [];

		if (playerId === undefined) {
			return Array.from(session.sockets);
		}

		return Array.from(session.sockets).filter(
			(socket) => socket.userToken?.playerId === playerId
		);
	}

	protected getExpiredGameIds(): number[] {
		const now = Date.now();
		const expiredGameIds: number[] = [];

		for (const [gameId, session] of this.sessions) {
			if (session.sockets.size > 0) {
				session.emptySince = undefined;
			} else if (session.emptySince === undefined) {
				session.emptySince = now;
			}

			const emptyTooLong = session.emptySince !== undefined && now - session.emptySince > this.emptySessionMs;
			const staleTooLong = now - session.lastActiveAt > this.staleSessionMs;

			if (emptyTooLong || staleTooLong) {
				expiredGameIds.push(gameId);
			}
		}

		return expiredGameIds;
	}

	protected cancelGame(gameId: number): Promise<void> {
		return this.onGameCancelled(gameId).catch((err) => {
			if (process.env.NODE_ENV === "development") {
				console.error("Game cancel failed", err);
			}
		});
	}

	protected cancelGameDetached(gameId: number): void {
		void this.cancelGame(gameId);
	}

	protected async cancelAllSessions(): Promise<void> {
		await Promise.all(
			Array.from(this.sessions.keys()).map((gameId) => this.cancelGame(gameId))
		);
	}

	protected stopTimer(): void {
		if (!this.timer) return;

		clearInterval(this.timer);
		this.timer = undefined;
	}
}