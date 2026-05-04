import WebSocket from "ws";
import type { ConnectedUserSocket } from "../../types/websocket/types";
import type { ServerMessage } from "../../types/websocket/server";
import type { JwtPayload } from "../../types/config";

export class WSTokenLifecycle {
	public constructor(private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void, private readonly rejectUnauthorized: (ws: ConnectedUserSocket) => void) { }

	private readonly refreshSkewMs: number = 60_000;
	private readonly expireGraceMs: number = 5_000;

	public clear(ws: ConnectedUserSocket): void {
		if (ws.refreshTimer) clearTimeout(ws.refreshTimer);
		ws.refreshTimer = undefined;
		if (ws.expireTimer) clearTimeout(ws.expireTimer);
		ws.expireTimer = undefined;
	}

	public schedule(ws: ConnectedUserSocket, payload: JwtPayload): void {
		this.clear(ws);

		if (typeof payload.exp !== "number") return;

		const nowMs = Date.now();
		const expMs = payload.exp * 1000;

		const refreshAtMs = expMs - this.refreshSkewMs;
		const refreshDelayMs = refreshAtMs - nowMs;

		if (refreshDelayMs <= 0) {
			if (ws.readyState === WebSocket.OPEN) {
				this.sendMessage(ws, { type: "REFRESH_REQUIRED" });
			}
		} else {
			ws.refreshTimer = setTimeout(() => {
				ws.refreshTimer = undefined;

				if (ws.readyState !== WebSocket.OPEN) return;
				this.sendMessage(ws, { type: "REFRESH_REQUIRED" });
			}, refreshDelayMs);

			ws.refreshTimer.unref?.();
		}

		const expireDelayMs = nowMs >= expMs ? this.expireGraceMs : (expMs - nowMs) + this.expireGraceMs;

		if (expireDelayMs <= 0) {
			this.clear(ws);
			this.rejectUnauthorized(ws);
			return;
		}

		ws.expireTimer = setTimeout(() => {
			ws.expireTimer = undefined;
			this.clear(ws);
			this.rejectUnauthorized(ws);
		}, expireDelayMs);

		ws.expireTimer.unref?.();
	}
}