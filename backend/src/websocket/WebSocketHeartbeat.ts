import type { WebSocketServer } from "ws";
import WebSocket from "ws";
import type { ConnectedUserSocket } from "../types/websocket";
import type { ServerMessage } from "../types/websocket";

export class WebSocketHeartbeat {
	public constructor(private readonly wss: WebSocketServer, private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) {
		this.start();
	}

	private timer?: NodeJS.Timeout;
	private readonly pingIntervalMs: number = 15_000;
	private readonly pongTimeoutMs: number = 100_000;

	public track(ws: ConnectedUserSocket): void {
		ws.lastPongAt = Date.now();

		ws.once("close", () => {
			ws.lastPongAt = undefined;
		});
	}

	public markPong(ws: ConnectedUserSocket): void {
		ws.lastPongAt = Date.now();
	}

	public start(): void {
		if (this.timer) return;

		this.timer = setInterval(() => {
			const now = Date.now();

			for (const ws of this.wss.clients as Set<ConnectedUserSocket>) {
				if (ws.readyState !== WebSocket.OPEN) continue;

				if (typeof ws.lastPongAt !== "number") ws.lastPongAt = now;

				if (now - ws.lastPongAt > this.pongTimeoutMs) {
					try {
						ws.terminate();
					} catch {
						// ignore
					}
					continue;
				}

				try {
					this.sendMessage(ws, { type: "PING", t: now });
				} catch {
					// ignore
				}
			}
		}, this.pingIntervalMs);

		this.timer.unref?.();
	}

	public stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}
}