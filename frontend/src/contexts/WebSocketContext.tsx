import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useUser } from "./UserContext";
import { authService } from "../services/auth";
import { ErrorCode } from "../types/index";
import type { ClientMessage, ServerMessage } from "../types/websocket";
import { useNavigate } from "react-router-dom";

type Handler = (msg: ServerMessage) => void;

type WebSocketContextType = {
	sendMessage: (msg: ClientMessage, loadingPopup?: Boolean) => Promise<boolean>;
	subscribe: (handler: Handler) => () => void;
};

// Starts as undefined so that cases where app is used without context throws an error
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const getWebSocketUrl = () => {
	const url = import.meta.env.VITE_WS_URL as string | undefined;
	if (!url) {
		console.error("No WebSocket Server (missing VITE_WS_URL)");
		return null;
	}
	return url;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
	const { user, authReady, logout } = useUser();
	const navigate = useNavigate();

	const webSocketRef = useRef<WebSocket | null>(null);

	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const refreshInFlightRef = useRef(false);

	const queueRef = useRef<ServerMessage[]>([]);
	const drainingRef = useRef(false);
	const drainScheduledRef = useRef(false);
	const subscribersRef = useRef(new Set<Handler>());

	const socketReadyRef = useRef(false);

	const waitingForReadyRef = useRef(new Set<{ resolve: (ok: boolean) => void; timerId: number }>());

	const authReadyRef = useRef(authReady);
	const userRef = useRef(user);

	const userId = user?.id ?? null;

	useEffect(() => {
		return () => {
			for (const waiter of waitingForReadyRef.current) {
				window.clearTimeout(waiter.timerId);
				try {
					waiter.resolve(false);
				} catch {
					// ignore
				}
			}
			waitingForReadyRef.current.clear();
		};
	}, []);

	useEffect(() => {
		authReadyRef.current = authReady;
		userRef.current = user;
	}, [authReady, user]);

	const notifyWaitingOk = useCallback((ok: boolean) => {
		for (const waiter of waitingForReadyRef.current) {
			window.clearTimeout(waiter.timerId);
			try {
				waiter.resolve(ok);
			} catch {
				// ignore
			}
		}
		waitingForReadyRef.current.clear();
	}, []);

	const setReady = useCallback((ok: boolean) => {
		socketReadyRef.current = ok;
		notifyWaitingOk(ok);
	}, [notifyWaitingOk]);

	const clearReconnectTimer = useCallback(() => {
		if (reconnectTimerRef.current != null) {
			window.clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	}, []);

	const closeSocket = useCallback(() => {
		const ws = webSocketRef.current;
		webSocketRef.current = null;

		if (ws) {
			try {
				ws.onopen = null;
				ws.onmessage = null;
				ws.onerror = null;
				ws.onclose = null;
			} catch {
				// ignore
			}

			try {
				ws.close();
			} catch {
				// ignore
			}
		}

		setReady(false);
	}, [setReady]);

	const scheduleReconnect = useCallback((connectFn: () => void) => {
		if (reconnectTimerRef.current != null) return;

		const attempt = reconnectAttemptRef.current++;
		const delay = Math.min(10_000, 500 * Math.pow(2, attempt));

		reconnectTimerRef.current = window.setTimeout(() => {
			reconnectTimerRef.current = null;
			connectFn();
		}, delay);
	}, []);

	const sendMessageToSocket = useCallback((msg: ClientMessage) => {
		const ws = webSocketRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return false;

		try {
			ws.send(JSON.stringify(msg));
			return true;
		} catch {
			return false;
		}
	}, []);

	const drainQueue = useCallback(() => {
		if (drainingRef.current) return;
		drainingRef.current = true;

		try {
			let i = 0;

			while (i < queueRef.current.length) {
				const msg = queueRef.current[i++];

				for (const handler of subscribersRef.current) {
					try {
						handler(msg);
					} catch {
						// ignore
					}
				}
			}

			if (i > 0) queueRef.current.splice(0, i);
		} finally {
			drainingRef.current = false;
		}
	}, []);

	const scheduleDrain = useCallback(() => {
		if (drainScheduledRef.current) return;
		drainScheduledRef.current = true;

		queueMicrotask(() => {
			drainScheduledRef.current = false;
			drainQueue();
		});
	}, [drainQueue]);

	const enqueue = useCallback((msg: ServerMessage) => {
		queueRef.current.push(msg);
		scheduleDrain();
	}, [scheduleDrain]);

	const waitForReady = useCallback(async () => {
		if (socketReadyRef.current) return true;

		return new Promise<boolean>((resolve) => {
			const waiter: { resolve: (value: boolean) => void; timerId: number } = { resolve, timerId: window.setTimeout(() => {
				if (socketReadyRef.current) {
					waitingForReadyRef.current.delete(waiter);
					resolve(true);
					return;
				}

				waitingForReadyRef.current.delete(waiter);

				const message: ServerMessage = {
					type: "ERROR",
					code: ErrorCode.NETWORK_ERROR,
				};
				enqueue(message);

				resolve(false);
			}, 2500)};

			waitingForReadyRef.current.add(waiter);
		});
	}, [enqueue]);

	const sendMessage = useCallback( async (msg: ClientMessage) => {
		if (!socketReadyRef.current) {
			const ok = await waitForReady();
			if (!ok) return false;
		}

		return sendMessageToSocket(msg);
	}, [sendMessageToSocket, waitForReady]);

	const subscribe = useCallback((handler: Handler) => {
		subscribersRef.current.add(handler);
		return () => subscribersRef.current.delete(handler);
	}, []);

	const connect = useCallback(() => {
		if (!authReady || !user) return;

		const existing = webSocketRef.current;
		if (
			existing &&
			(existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
		) {
			return;
		}

		const webSocketUrl = getWebSocketUrl();
		if (!webSocketUrl) return;

		const ws = new WebSocket(webSocketUrl);
		webSocketRef.current = ws;

		ws.onopen = () => {
			reconnectAttemptRef.current = 0;
			setReady(false);
		};

		ws.onmessage = (event) => {
			let msg: ServerMessage;

			try {
				msg = JSON.parse(event.data) as ServerMessage;
			} catch {
				if (import.meta.env.VITE_ENV === "development") {
					console.log("WS <- Bad JSON");
				}
				return;
			}

			if (import.meta.env.VITE_ENV === "development") {
				console.log("WS <-", msg.type, msg);
			}

			if (msg.type === "PING") {
				sendMessageToSocket({ type: "PONG", t: msg.t });
				return;
			}

			switch (msg.type) {
				case "AUTH_OK": {
					if (socketReadyRef.current === false) {
						sendMessageToSocket({ type: "RECOVER_GAME" });
					}
					setReady(true);
					break;
				}
				case "RECOVER_GAME_OK": {
					navigate(`/game-lobby/${msg.gameCode}`, { replace: true });
					break;
				}
				case "TOKEN_REQUIRED": {
					setReady(false);

					if (refreshInFlightRef.current) break;

					const token = authService.getAccessToken();
					if (token) {
						sendMessageToSocket({ type: "AUTH_UPDATE", token });
						break;
					}

					refreshInFlightRef.current = true;

					(async () => {
						try {
							await authService.refreshToken();

							const newToken = authService.getAccessToken();
							if (!newToken) {
								closeSocket();
								logout();
								return;
							}

							sendMessageToSocket({ type: "AUTH_UPDATE", token: newToken });
						} catch {
							closeSocket();
							logout();
						} finally {
							refreshInFlightRef.current = false;
						}
					})();

					break;
				}
				case "REFRESH_REQUIRED": {
					setReady(false);

					if (refreshInFlightRef.current) break;
					refreshInFlightRef.current = true;

					(async () => {
						try {
							await authService.refreshToken();

							const newToken = authService.getAccessToken();
							if (!newToken) {
								closeSocket();
								logout();
								return;
							}

							sendMessageToSocket({ type: "AUTH_UPDATE", token: newToken });
						} catch {
							closeSocket();
							logout();
						} finally {
							refreshInFlightRef.current = false;
						}
					})();

					break;
				}
				case "ERROR": {
					enqueue(msg);

					if (msg.code === ErrorCode.UNAUTHORIZED) {
						setReady(false);
						closeSocket();
						logout();
					}

					break;
				}
				default:
					enqueue(msg);
					break;
			}
		};

		ws.onclose = () => {
			setReady(false);

			if (import.meta.env.VITE_ENV === "development") {
				console.log("WS closed");
			}

			if (authReadyRef.current && userRef.current) {
				clearReconnectTimer();
				scheduleReconnect(() => connectRef.current());
			}
		};

		ws.onerror = (error) => {
			if (import.meta.env.VITE_ENV === "development") {
				console.log("WebSocket error:", error);
			}
		};
	}, [ authReady, user, enqueue, closeSocket, clearReconnectTimer, scheduleReconnect, logout, sendMessageToSocket, setReady, navigate]);

	const connectRef = useRef(connect);
	useEffect(() => {
		connectRef.current = connect;
	}, [connect]);

	useEffect(() => {
		if (authReady && userId) {
			connect();
		} else {
			clearReconnectTimer();
			closeSocket();
		}
	}, [authReady, userId, connect, clearReconnectTimer, closeSocket]);

	// Set up unauthorized logout handler
	useEffect(() => {
		return () => {
			clearReconnectTimer();
			closeSocket();
		};
	}, [clearReconnectTimer, closeSocket]);

	// Exposed context value
	const value = useMemo<WebSocketContextType>(
		() => ({
			sendMessage,
			subscribe,
		}),
		[sendMessage, subscribe]
	);

	return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

// Hook for accessing this context
export const useWebSocket = () => {
	const context = useContext(WebSocketContext);
	if (!context) {
		throw new Error("No websocket context found!");
	}
	return context;
};