import WebSocket from "ws";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { app, wss } from "../../src/index";
import { ErrorCode } from "../../src/types";
import prisma from "../../prisma/client";
import { seed } from "../../prisma/seed";
import { registerAndLogin, type TestUser } from "./helpers/auth";
import { disconnectIntegrationDatabase, resetIntegrationDatabase } from "./helpers/database";
import { closeWs, connectAuthenticatedWs, sendWs, startIntegrationServer, type IntegrationServer, waitForWsMessage } from "./helpers/ws";
import type { LobbyStateData, RoleSettings } from "../../src/types/websocket/types";

// Test data
type ConnectedTestUser = {
	user: TestUser;
	ws: WebSocket;
};

describe("Žaidimo laukiamojo kambario integraciniai testai", () => {
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

	it("Sukuria žaidimą ir prijungia kūrėją prie laukiamojo kambario", async () => {
		const creator = await connectUser("game_creator");
		const gameCode = await createAndJoinGame(creator.ws);

		const state = await requestLobbyState(creator.ws);

		expect(gameCode).toMatch(/^[A-Z]{6}$/);
		expect(state).toMatchObject({
			gameCode,
			metaSettings: expect.objectContaining({
				minPlayers: 5,
				maxPlayers: 10,
				roleDistributionMode: "exact"
			})
		});
		expect(state.players).toEqual([
			expect.objectContaining({
				playerId: creator.user.playerId,
				username: creator.user.username,
				type: "user",
				seatNr: 1,
				isOnline: true,
				isReady: false
			})
		]);
	});

	it("Atmeta prisijungimą prie neegzistuojančio žaidimo kodo", async () => {
		const player = await connectUser("game_missing");

		sendWs(player.ws, { type: "JOIN_GAME", gameCode: "NOPE" });

		const error = await waitForWsMessage(player.ws, "ERROR");
		expect(error.code).toBe(ErrorCode.GAME_NOT_FOUND);
	});

	it("Sinchronizuoja dviejų žaidėjų laukiamojo kambario būseną", async () => {
		const creator = await connectUser("game_sync_creator");
		const joiner = await connectUser("game_sync_joiner");
		const gameCode = await createAndJoinGame(creator.ws);

		await joinGame(joiner.ws, gameCode);

		const creatorState = await requestLobbyState(creator.ws);
		const joinerState = await requestLobbyState(joiner.ws);
		const expectedPlayers = [
			expect.objectContaining({ playerId: creator.user.playerId, seatNr: 1, isOnline: true }),
			expect.objectContaining({ playerId: joiner.user.playerId, seatNr: 2, isOnline: true })
		];

		expect(creatorState.players).toEqual(expectedPlayers);
		expect(joinerState.players).toEqual(expectedPlayers);
	});

	it("Tikrina lyderio teises ir leidžia keisti laukiamojo kambario būseną", async () => {
		const leader = await connectUser("game_leader");
		const member = await connectUser("game_member");
		const gameCode = await createAndJoinGame(leader.ws);
		await joinGame(member.ws, gameCode);

		sendWs(leader.ws, {
			type: "UPDATE_LOBBY_SETTINGS",
			metaSettings: { maxPlayers: 8 },
			roleSettings: {}
		});
		await waitForWsMessage(leader.ws, "UPDATE_LOBBY_SETTINGS_OK");

		sendWs(member.ws, {
			type: "UPDATE_LOBBY_SETTINGS",
			metaSettings: { daySeconds: 20 },
			roleSettings: {}
		});
		const error = await waitForWsMessage(member.ws, "ERROR");
		expect(error.code).toBe(ErrorCode.NOT_GAME_LEADER);

		sendWs(member.ws, { type: "CHANGE_SEAT", seatNr: 4 });
		await waitForWsMessage(member.ws, "CHANGE_SEAT_OK");

		const state = await requestLobbyState(leader.ws);
		expect(state.metaSettings.maxPlayers).toBe(8);
		expect(findPlayer(state, member.user.playerId)).toMatchObject({ seatNr: 4 });
	});

	it("Paleidžia žaidimo starto laikmatį, kai rolės ir pasiruošimas yra tinkami", async () => {
		const players: ConnectedTestUser[] = [];
		for (let index = 0; index < 5; index++) {
			players.push(await connectUser(`game_ready_${index}`));
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
				daySeconds: 10,
				votingSeconds: 10,
				nightSeconds: 10,
				roleDistributionMode: "exact"
			},
			roleSettings
		});
		await waitForWsMessage(players[0].ws, "UPDATE_LOBBY_SETTINGS_OK");

		for (const player of players.slice(0, -1)) {
			sendWs(player.ws, { type: "SET_READY", ready: true });
			await waitForWsMessage(player.ws, "SET_READY_OK");
		}

		const gameStarting = waitForWsMessage(players[0].ws, "GAME_STARTING");
		const lastPlayer = players[players.length - 1];
		sendWs(lastPlayer.ws, { type: "SET_READY", ready: true });
		await waitForWsMessage(lastPlayer.ws, "SET_READY_OK");

		const startingMessage = await gameStarting;
		expect(startingMessage.startsAt).toBeGreaterThan(Date.now());

		const state = await requestLobbyState(players[0].ws);
		expect(state.players.every((player) => player.isReady)).toBe(true);
	});

	// Test helpers
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

	async function requestLobbyState(ws: WebSocket): Promise<LobbyStateData> {
		sendWs(ws, { type: "REQUEST_LOBBY_STATE" });
		const message = await waitForWsMessage(ws, "LOBBY_STATE");
		return message.data;
	}

	function findPlayer(state: LobbyStateData, playerId: number): LobbyStateData["players"][number] {
		const player = state.players.find((candidate) => candidate.playerId === playerId);
		if (!player) {
			throw new Error(`Player ${playerId} was not found in lobby state`);
		}

		return player;
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
