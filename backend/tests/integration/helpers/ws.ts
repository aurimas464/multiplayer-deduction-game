import WebSocket from "ws";
import type { AddressInfo } from "net";
import { createServer, type Server } from "http";
import type { ServerMessage } from "../../../src/types/websocket/server";
import type { ClientMessage } from "../../../src/types/websocket/client";
import { app } from "../../../src/index";
import config from "../../../src/config";
import { WSController } from "../../../src/websocket/WSController";

export type IntegrationServer = {
	app: typeof app;
	server: Server;
	wss: WSController;
	url: string;
	close: () => Promise<void>;
};

export async function startIntegrationServer(): Promise<IntegrationServer> {
	const server = createServer(app);
	const wss = new WSController(server, config);

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});

	const address = server.address() as AddressInfo;

	return { app, server, wss, url: `ws://127.0.0.1:${address.port}/ws`,
		close: async () => {
			await wss.close();

			await new Promise<void>((resolve, reject) => {
				if (!server.listening) {
					resolve();
					return;
				}

				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		}
	};
}

export async function connectAuthenticatedWs(url: string, token: string): Promise<WebSocket> {
	const ws = new WebSocket(url);

	await new Promise<void>((resolve, reject) => {
		ws.once("open", () => resolve());
		ws.once("error", reject);
	});

	ws.send(JSON.stringify({ type: "AUTH_UPDATE", token }));
	await waitForWsMessage(ws, "AUTH_OK");

	return ws;
}

export function sendWs(ws: WebSocket, message: ClientMessage): void {
	ws.send(JSON.stringify(message));
}

export async function waitForWsMessage<TType extends ServerMessage["type"]>(ws: WebSocket, type: TType, timeoutMs = 5_000): Promise<Extract<ServerMessage, { type: TType }>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for WS message ${type}`));
		}, timeoutMs);

		const onMessage = (raw: WebSocket.RawData) => {
			const message = JSON.parse(raw.toString()) as ServerMessage;
			if (message.type !== type) return;

			cleanup();
			resolve(message as Extract<ServerMessage, { type: TType }>);
		};

		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		const cleanup = () => {
			clearTimeout(timeout);
			ws.off("message", onMessage);
			ws.off("error", onError);
		};

		ws.on("message", onMessage);
		ws.on("error", onError);
	});
}

export async function closeWs(ws: WebSocket): Promise<void> {
	if (ws.readyState === WebSocket.CLOSED) return;

	await new Promise<void>((resolve) => {
		ws.once("close", () => resolve());
		ws.close();
		setTimeout(() => {
			if (ws.readyState !== WebSocket.CLOSED) {
				ws.terminate();
			}
			resolve();
		}, 250).unref?.();
	});
}
