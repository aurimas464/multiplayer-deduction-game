import jwt from "jsonwebtoken";
import type { ConnectedUserSocket } from "../../types/websocket/types";
import type { ServerMessage } from "../../types/websocket/server";
import type { JwtPayload } from "../../types/config";
import { ErrorCode } from "../../types/index";

export class WSAuthGuard {
	public constructor(private readonly jwtSecret: string, private readonly sendMessage: (ws: ConnectedUserSocket, msg: ServerMessage) => void) { }

	private readonly authenticateTimeoutMs: number = 10_000;

	public attach(ws: ConnectedUserSocket): void {
		ws.isAuthenticated = false;
		ws.userToken = undefined;
		this.sendMessage(ws, { type: "TOKEN_REQUIRED" });
		this.startAuthTimeout(ws);
	}
	
	public clear(ws: ConnectedUserSocket): void {
		if (ws.authenticateTimer) clearTimeout(ws.authenticateTimer);
		ws.authenticateTimer = undefined;
	}

	public handleAuthUpdate(ws: ConnectedUserSocket, tokenInput: string): JwtPayload | null {
		const userToken = this.verifyToken(tokenInput);

		if (!userToken) {
			this.rejectUnauthorized(ws);
			return null;
		}

		ws.userToken = userToken;
		ws.isAuthenticated = true;

		this.clear(ws);
		this.sendMessage(ws, { type: "AUTH_OK" });

		return userToken;
	}

	public ensureAuthenticated(ws: ConnectedUserSocket): boolean {
		return ws.isAuthenticated === true && !!ws.userToken;
	}

	public rejectUnauthorized(ws: ConnectedUserSocket): void {
		this.clear(ws);

		if (ws.readyState !== WebSocket.OPEN) return;

		try {
			this.sendMessage(ws, { type: "ERROR", code: ErrorCode.UNAUTHORIZED });
			ws.close(1008);
		} catch {
			try {
				ws.terminate();
			} catch {
				// ignore
			}
		}
	}

	private startAuthTimeout(ws: ConnectedUserSocket): void {
		this.clear(ws);

		ws.authenticateTimer = setTimeout(() => {
			ws.authenticateTimer = undefined;

			if (ws.readyState !== WebSocket.OPEN) return;
			if (ws.isAuthenticated) return;

			this.rejectUnauthorized(ws);
		}, this.authenticateTimeoutMs);

		ws.authenticateTimer.unref?.();
	}

	private verifyToken(tokenInput: string): JwtPayload | null {
		const token = this.normalizeToken(tokenInput);
		if (!token) return null;

		try {
			const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] });
			if (!decoded || typeof decoded !== "object") return null;
			return decoded as JwtPayload;
		} catch {
			return null;
		}
	}

	private normalizeToken(raw: string): string | null {
		const string = raw.trim();
		if (!string) return null;

		if (string.toLowerCase().startsWith("bearer ")) {
			const token = string.slice("bearer ".length).trim();
			return token || null;
		}

		return string;
	}
}