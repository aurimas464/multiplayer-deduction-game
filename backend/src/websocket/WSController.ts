import type { Server as HttpServer } from "http";
import WebSocket, { WebSocketServer } from "ws";

import type { ConnectedUserSocket } from "../types/websocket/types";
import { ClientMessage, clientMessageSchema } from "../types/websocket/client";
import type { ServerMessage } from "../types/websocket/server";

import type { AppConfig } from "../types/config";
import { ErrorCode, AppError } from "../types/index";

import { WSAuthGuard } from "./core/WSAuthGuard";
import { WSHeartbeatMonitor } from "./core/WSHeartbeatMonitor";
import { WSTokenLifecycle } from "./core/WSTokenLifecycle";

import { WSGameHandler } from "./game/WSGameHandler";
import { WSSocialHandler } from "./social/WSSocialHandler";
import { validateData } from "../utils/validation";

export class WSController {
	private readonly wss: WebSocketServer;

	private readonly authGuard: WSAuthGuard;
	private readonly tokenLifecycle: WSTokenLifecycle;
	private readonly heartbeatMonitor: WSHeartbeatMonitor;
	private readonly gameHandler: WSGameHandler;
	private readonly socialHandler: WSSocialHandler;

	public constructor(server: HttpServer, config: AppConfig) {
		this.wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

		this.authGuard = new WSAuthGuard(config.jwtSecret, (ws, msg) => this.sendMessage(ws, msg));
		this.tokenLifecycle = new WSTokenLifecycle((ws, msg) => this.sendMessage(ws, msg), (ws) => this.authGuard.rejectUnauthorized(ws));
		this.heartbeatMonitor = new WSHeartbeatMonitor(this.wss, (ws, msg) => this.sendMessage(ws, msg));
		this.gameHandler = new WSGameHandler((ws, msg) => this.sendMessage(ws, msg));
		this.socialHandler = new WSSocialHandler((ws, msg) => this.sendMessage(ws, msg));

		this.wss.on("connection", (socket: ConnectedUserSocket) => {
			this.authGuard.attach(socket);
			this.heartbeatMonitor.attach(socket);

			socket.on("message", async (message) => {
				if (socket.readyState !== WebSocket.OPEN) return;

				let json: unknown;
				try {
					json = JSON.parse(message.toString());
				} catch {
					this.sendMessage(socket, { type: "ERROR", code: ErrorCode.INVALID_REQUEST });

					if (process.env.NODE_ENV === "development") {
						console.log("WS <-", socket.userToken?.username, "- Bad JSON");
					}

					return;
				}

				if (process.env.NODE_ENV === "development") {
					console.log("WS <-", socket.userToken?.username, "-", json);
				}

				try {
					const parsed = validateData(clientMessageSchema, json);
					await this.handleMessage(socket, parsed);
				} catch (error) {
					if (error instanceof AppError) {
						this.sendMessage(socket, {
							type: "ERROR",
							code: error.code,
							details: error.details,
						});

						return;
					}

					if (process.env.NODE_ENV === "development") {
						console.error("WS unexpected error:", error);
					}

					this.sendMessage(socket, {
						type: "ERROR",
						code: ErrorCode.INTERNAL_ERROR,
					});
				}
			});

			socket.on("close", () => {
				this.authGuard.clear(socket);
				this.tokenLifecycle.clear(socket);
				this.heartbeatMonitor.clear(socket);
				this.socialHandler.untrack(socket);
				this.gameHandler.untrack(socket);

				if (process.env.NODE_ENV === "development") {
					console.log("WS closed", socket.userToken?.username);
				}
			});

			socket.on("error", (error) => {
				if (process.env.NODE_ENV === "development") {
					console.error("WS error", socket.userToken?.username, error);
				}
			});
		});
	}

	public async close(): Promise<void> {
		this.heartbeatMonitor.stop();
		await this.gameHandler.stop();

		for (const ws of this.wss.clients as Set<ConnectedUserSocket>) {
			try {
				this.authGuard.clear(ws);
				this.tokenLifecycle.clear(ws);
				this.heartbeatMonitor.clear(ws);
				this.socialHandler.untrack(ws);
				this.gameHandler.untrack(ws);
				ws.terminate();
			} catch {
				if (process.env.NODE_ENV === "development") {
					console.error("WSS close error");
				}
			}
		}

		await new Promise<void>((resolve) => {
			this.wss.close(() => resolve());
		});
	}

	private async handleMessage(socket: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		switch (msg.type) {
			case "PONG":
				this.heartbeatMonitor.markPong(socket);
				return;
			case "PING":
				this.sendMessage(socket, { type: "PONG", t: Date.now() });
				return;
			case "AUTH_UPDATE": {
				const userToken = this.authGuard.handleAuthUpdate(socket, msg.token);
				if (!userToken) return;

				this.tokenLifecycle.schedule(socket, userToken);
				this.socialHandler.track(socket);
				return;
			}
		}

		if (!this.authGuard.ensureAuthenticated(socket)) {
			this.authGuard.rejectUnauthorized(socket);
			return;
		}

		await this.gameHandler.handleMessage(socket, msg);
		await this.socialHandler.handleMessage(socket, msg);
	}

	private sendMessage(ws: ConnectedUserSocket, msg: ServerMessage): void {
		if (ws.readyState !== WebSocket.OPEN) return;

		try {
			ws.send(JSON.stringify(msg));
		} catch {
			if (process.env.NODE_ENV === "development") {
				console.error("WSS send error");
			}
		}
	}
}