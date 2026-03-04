import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import type { ConnectedUserSocket, ClientMessage, ServerMessage } from "../types/websocket";
import type { AppConfig } from "../types/config";
import { WebSocketAuthentication } from "./WebSocketAuth";
import { WebSocketHeartbeat } from "./WebSocketHeartbeat";
import { WebSocketRefreshScheduler } from "./WebSocketRefreshScheduler";
import { ErrorCode } from "../types/index";
import { clientMessageSchema } from "../types/websocket";
import { WebSocketGame } from "./WebSocketGame";
import { AppError } from "../types/index";
import { parseBody } from "../utils/validation";

export class GameWebSocketServer {
	private readonly wss: WebSocketServer;

	private readonly auth: WebSocketAuthentication;
	private readonly refreshScheduler: WebSocketRefreshScheduler;
	private readonly heartbeat: WebSocketHeartbeat;
	private readonly game: WebSocketGame;

	public constructor(server: HttpServer, config: AppConfig) {
		this.wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

		this.auth = new WebSocketAuthentication(config.jwtSecret, (ws, msg) => this.sendMessage(ws, msg));
		this.refreshScheduler = new WebSocketRefreshScheduler((ws, msg) => this.sendMessage(ws, msg), (ws) => this.auth.rejectUnauthorized(ws));
		this.heartbeat = new WebSocketHeartbeat(this.wss, (ws, msg) => this.sendMessage(ws, msg));
		this.game = new WebSocketGame((ws, msg) => this.sendMessage(ws, msg));

		this.wss.on("connection", (socket: ConnectedUserSocket, _req: IncomingMessage) => {
			this.auth.begin(socket);
			this.refreshScheduler.track(socket);
			this.heartbeat.track(socket);
			this.game.track(socket);

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
					const parsed = parseBody(clientMessageSchema, json);
					await this.handleMessage(socket, parsed);
				} catch (error) {
					if (error instanceof AppError) {
						this.sendMessage(socket, {
							type: "ERROR",
							code: error.code,
							details: error.details,
						})
						return;
					}

					if (process.env.NODE_ENV === "development") {
						console.error("WS unexpected error:", error)
					}

					this.sendMessage(socket, {
						type: "ERROR",
						code: ErrorCode.INTERNAL_ERROR,
					})
				}
			});

			socket.on("close", () => {
				if (process.env.NODE_ENV === "development") {
					console.log("WS closed", socket.userToken?.username);
				}
			});

			socket.on("error", (error) => {
				if (process.env.NODE_ENV === "development") {
					console.log("WS error", socket.userToken?.username, error);
				}
			});
		});
	}

	public close(): void {
		this.heartbeat.stop();

		for (const ws of this.wss.clients as Set<ConnectedUserSocket>) {
			try {
				this.auth.clear(ws);
				this.refreshScheduler.clear(ws);
				ws.terminate();
			} catch {
				if (process.env.NODE_ENV === "development") {
					console.log("WSS close error");
				}
			}
		}

		this.wss.close();
	}

	private async handleMessage(socket: ConnectedUserSocket, msg: ClientMessage): Promise<void> {
		switch (msg.type) {
			case "PONG":
				this.heartbeat.markPong(socket);
				return;
			case "PING":
				this.sendMessage(socket, { type: "PONG", t: Date.now() });
				return;
			case "AUTH_UPDATE": {
				const userToken = this.auth.handleAuthUpdate(socket, msg.token);
				if (!userToken) return;

				this.refreshScheduler.clear(socket);
				this.refreshScheduler.schedule(socket, userToken);
				return;
			}
		}

		if (!this.auth.ensureAuthenticated(socket)) {
			this.auth.rejectUnauthorized(socket);
			return;
		}

		await this.game.handleMessage(socket, msg);
	}

	private sendMessage(ws: ConnectedUserSocket, msg: ServerMessage): void {
		if (ws.readyState !== WebSocket.OPEN) return;

		try {
			ws.send(JSON.stringify(msg));
		} catch {
			if (process.env.NODE_ENV === "development") {
				console.log("WSS send error");
			}
		}
	}
}