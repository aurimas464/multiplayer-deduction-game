import WebSocket from "ws";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { app, wss } from "../../src/index";
import { ErrorCode } from "../../src/types";
import type { ServerMessage } from "../../src/types/websocket/server";
import type { GameStateData, RoleSettings } from "../../src/types/websocket/types";
import prisma from "../../prisma/client";
import { seed } from "../../prisma/seed";
import { registerAndLogin, type TestUser } from "./helpers/auth";
import { disconnectIntegrationDatabase, resetIntegrationDatabase } from "./helpers/database";
import { closeWs, connectAuthenticatedWs, sendWs, startIntegrationServer, type IntegrationServer, waitForWsMessage } from "./helpers/ws";

// Test data
type ConnectedTestUser = {
	user: TestUser;
	ws: WebSocket;
};

type ActiveGameFixture = {
	gameCode: string;
	gameId: number;
	players: ConnectedTestUser[];
};

describe("Aktyvios žaidimo partijos integraciniai testai", () => {
	let server: IntegrationServer;
	let sockets: WebSocket[];

	beforeEach(async () => {
		await resetIntegrationDatabase();
		await seed();
		server = await startIntegrationServer();
		sockets = [];
	});

	afterEach(async () => {
		await Promise.all(sockets.map((ws) => closeWs(ws)));
		if (server) await server.close();
	});

	afterAll(async () => {
		await wss.close();
		await disconnectIntegrationDatabase();
	});

	it("Pradeda aktyvią partiją po visų žaidėjų pasiruošimo", async () => {
		const fixture = await startActiveGame();
		const storedGame = await prisma.game.findUnique({ where: { id: fixture.gameId } });
		const participants = await prisma.participant.findMany({ where: { gameId: fixture.gameId } });

		expect(storedGame).toMatchObject({ status: "in_progress" });
		expect(participants).toHaveLength(5);
		expect(participants.every((participant) => participant.roleId !== null)).toBe(true);
	});

	it("Grąžina aktyvios partijos būseną su žaidėjo role ir faze", async () => {
		const fixture = await startActiveGame();
		const state = await requestGameState(fixture.players[0].ws);

		expect(state).toMatchObject({
			gameCode: fixture.gameCode,
			gameId: fixture.gameId,
			myPlayerId: fixture.players[0].user.playerId,
			currentPhase: "day",
			dayNumber: 1,
			availableActions: []
		});
		expect(["commoner", "vampire"]).toContain(state.myRoleKey);
		expect(state.players).toHaveLength(5);
		expect(state.players.every((player) => !player.isEliminated)).toBe(true);
	});

	it("Transliuoja dienos pokalbio žinutę aktyvios partijos dalyviams", async () => {
		const fixture = await startActiveGame();
		const sender = fixture.players[0];
		const recipient = fixture.players[1];
		const messageText = "We should watch the quiet seats";

		const senderMessage = waitForWsMessageMatching(sender.ws, "GAME_CHAT_MESSAGE", (message) => message.data.message === messageText);
		const recipientMessage = waitForWsMessageMatching(recipient.ws, "GAME_CHAT_MESSAGE", (message) => message.data.message === messageText);
		sendWs(sender.ws, { type: "SEND_GAME_CHAT_MESSAGE", message: messageText });

		const [senderReceived, recipientReceived] = await Promise.all([senderMessage, recipientMessage]);
		expect(senderReceived.data).toMatchObject({
			gameId: fixture.gameId,
			playerId: sender.user.playerId,
			message: messageText,
			messageType: "player",
			dayNumber: 1,
			phase: "day"
		});
		expect(recipientReceived.data.id).toBe(senderReceived.data.id);
	});

	it("Atmeta žaidėjo veiksmą dienos fazėje", async () => {
		const fixture = await startActiveGame();
		const actor = fixture.players[0];
		const target = fixture.players[1];

		sendWs(actor.ws, { type: "PLAYER_ACTION", action: "vote", targetPlayerId: target.user.playerId });

		const error = await waitForWsMessage(actor.ws, "ERROR");
		expect(error.code).toBe(ErrorCode.INVALID_ACTION);
	});

	it("Atkuria aktyvią partiją prisijungus iš naujo", async () => {
		const fixture = await startActiveGame();
		const reconnecting = fixture.players[0];

		await closeWs(reconnecting.ws);
		sockets = sockets.filter((ws) => ws !== reconnecting.ws);

		const reconnectedWs = await connectAuthenticatedWs(server.url, reconnecting.user.accessToken);
		sockets.push(reconnectedWs);

		const recoveredMessage = waitForWsMessage(reconnectedWs, "RECOVER_GAME_OK");
		const stateMessage = waitForWsMessage(reconnectedWs, "GAME_STATE");
		sendWs(reconnectedWs, { type: "RECOVER_GAME" });
		const [recovered, state] = await Promise.all([recoveredMessage, stateMessage]);

		expect(recovered).toMatchObject({ gameCode: fixture.gameCode, state: "inGame" });
		expect(state.data).toMatchObject({
			gameCode: fixture.gameCode,
			gameId: fixture.gameId,
			myPlayerId: reconnecting.user.playerId,
			currentPhase: "day"
		});
	});

	// Test helpers
	async function startActiveGame(): Promise<ActiveGameFixture> {
		const players: ConnectedTestUser[] = [];
		for (let index = 0; index < 5; index++) {
			players.push(await connectUser(`in_game_${index}`));
		}

		const gameCode = await createAndJoinGame(players[0].ws);
		for (const player of players.slice(1)) {
			await joinGame(player.ws, gameCode);
		}

		const roleSettings = await getFivePlayerRoleSettings();
		sendWs(players[0].ws, {
			type: "UPDATE_LOBBY_SETTINGS",
			metaSettings: {
				minPlayers: 5,
				maxPlayers: 5,
				daySeconds: 999,
				votingSeconds: 999,
				nightSeconds: 999,
				roleDistributionMode: "exact"
			},
			roleSettings
		});
		await waitForWsMessage(players[0].ws, "UPDATE_LOBBY_SETTINGS_OK");

		for (const player of players.slice(0, -1)) {
			sendWs(player.ws, { type: "SET_READY", ready: true });
			await waitForWsMessage(player.ws, "SET_READY_OK");
		}

		const gameStarted = waitForWsMessage(players[0].ws, "GAME_STARTED", 15_000);
		const lastPlayer = players[players.length - 1];
		sendWs(lastPlayer.ws, { type: "SET_READY", ready: true });
		await waitForWsMessage(lastPlayer.ws, "SET_READY_OK");

		const started = await gameStarted;
		return { gameCode, gameId: started.gameId, players };
	}

	async function connectUser(label: string): Promise<ConnectedTestUser> {
		const user = await registerAndLogin(app, label);
		const ws = await connectAuthenticatedWs(server.url, user.accessToken);
		sockets.push(ws);
		return { user, ws };
	}

	async function createAndJoinGame(ws: WebSocket): Promise<string> {
		sendWs(ws, { type: "CREATE_GAME" });
		const created = await waitForWsMessage(ws, "CREATE_GAME_OK");
		await joinGame(ws, created.gameCode);
		return created.gameCode;
	}

	async function joinGame(ws: WebSocket, gameCode: string): Promise<void> {
		sendWs(ws, { type: "JOIN_GAME", gameCode });
		await waitForWsMessage(ws, "JOIN_GAME_OK");
	}

	async function requestGameState(ws: WebSocket): Promise<GameStateData> {
		sendWs(ws, { type: "REQUEST_GAME_STATE" });
		const message = await waitForWsMessage(ws, "GAME_STATE");
		return message.data;
	}

	async function getFivePlayerRoleSettings(): Promise<RoleSettings> {
		const roles = await prisma.role.findMany({
			where: { key: { in: ["commoner", "vampire"] } }
		});
		const commoner = roles.find((role) => role.key === "commoner");
		const vampire = roles.find((role) => role.key === "vampire");

		if (!commoner || !vampire) {
			throw new Error("Required seeded roles were not found");
		}

		return {
			[commoner.id]: 4,
			[vampire.id]: 1
		};
	}
});

// Test helpers
async function waitForWsMessageMatching<TType extends ServerMessage["type"]>(
	ws: WebSocket,
	type: TType,
	predicate: (message: Extract<ServerMessage, { type: TType }>) => boolean,
	timeoutMs = 5_000
): Promise<Extract<ServerMessage, { type: TType }>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for matching WS message ${type}`));
		}, timeoutMs);

		const onMessage = (raw: WebSocket.RawData) => {
			const message = JSON.parse(raw.toString()) as ServerMessage;
			if (message.type !== type) return;

			const typedMessage = message as Extract<ServerMessage, { type: TType }>;
			if (!predicate(typedMessage)) return;

			cleanup();
			resolve(typedMessage);
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
