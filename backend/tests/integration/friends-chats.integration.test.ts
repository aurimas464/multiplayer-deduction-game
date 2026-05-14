import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { app, wss } from "../../src/index";
import { authHeader, registerAndLogin, type TestUser } from "./helpers/auth";
import { disconnectIntegrationDatabase, resetIntegrationDatabase } from "./helpers/database";
import { closeWs, connectAuthenticatedWs, sendWs, startIntegrationServer, type IntegrationServer, waitForWsMessage } from "./helpers/ws";
import type WebSocket from "ws";

describe("Socialinės komunikacijos integraciniai testai", () => {
	let server: IntegrationServer;
	let alice: TestUser;
	let bob: TestUser;
	let aliceWs: WebSocket;
	let bobWs: WebSocket;

	beforeEach(async () => {
		await resetIntegrationDatabase();
		server = await startIntegrationServer();
		alice = await registerAndLogin(app, "alice");
		bob = await registerAndLogin(app, "bob");
		aliceWs = await connectAuthenticatedWs(server.url, alice.accessToken);
		bobWs = await connectAuthenticatedWs(server.url, bob.accessToken);
	});

	afterEach(async () => {
		if (aliceWs) await closeWs(aliceWs);
		if (bobWs) await closeWs(bobWs);
		if (server) await server.close();
	});

	afterAll(async () => {
		await wss.close();
		await disconnectIntegrationDatabase();
	});

	it("Išsiunčia draugo užklausą ir grąžina laukiančių bei išsiųstų užklausų sąrašus", async () => {
		await sendFriendRequest();

		await request(app)
			.get("/api/friendships/pending")
			.set(authHeader(bob.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toEqual([expect.objectContaining({ id: alice.id })]);
			});

		await request(app)
			.get("/api/friendships/sent")
			.set(authHeader(alice.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toEqual([expect.objectContaining({ id: bob.id })]);
			});
	});

	it("Priima draugo užklausą ir grąžina prisijungusio draugo būseną", async () => {
		await makeFriends();

		await request(app)
			.get("/api/friendships/friends")
			.set(authHeader(alice.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toEqual([expect.objectContaining({ id: bob.id })]);
			});

		sendWs(aliceWs, { type: "CHECK_ONLINE", userIds: [bob.id] });
		await expect(waitForWsMessage(aliceWs, "MARK_ONLINE")).resolves.toEqual({ type: "MARK_ONLINE", userIds: [bob.id] });
	});

	it("Užblokuoja ir atblokuoja priimtą draugą", async () => {
		await makeFriends();

		sendWs(aliceWs, { type: "BLOCK_USER", userId: bob.id });
		await expect(waitForWsMessage(aliceWs, "BLOCK_USER_OK")).resolves.toMatchObject({ targetUser: { id: bob.id } });
		await expect(waitForWsMessage(bobWs, "USER_BLOCKED_YOU")).resolves.toMatchObject({ fromUser: { id: alice.id } });

		await request(app)
			.get("/api/friendships/blocked?offset=0&limit=10")
			.set(authHeader(alice.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result.data).toEqual([expect.objectContaining({ id: bob.id })]);
			});

		sendWs(aliceWs, { type: "UNBLOCK_USER", userId: bob.id });
		await expect(waitForWsMessage(aliceWs, "UNBLOCK_USER_OK")).resolves.toEqual({ type: "UNBLOCK_USER_OK", targetUserId: bob.id });
	});

	it("Išsiunčia asmeninę žinutę per WebSocket ir grąžina istoriją per API", async () => {
		await makeFriends();

		sendWs(aliceWs, { type: "SEND_DIRECT_CHAT_MESSAGE", targetUserId: bob.id, message: "Hey lobby" });
		const senderMessage = await waitForWsMessage(aliceWs, "DIRECT_CHAT_MESSAGE");
		const recipientMessage = await waitForWsMessage(bobWs, "DIRECT_CHAT_MESSAGE");

		expect(recipientMessage.data).toMatchObject({ id: senderMessage.data.id, message: "Hey lobby", senderId: alice.id });

		await request(app)
			.get(`/api/chats/direct/${bob.id}/messages?offset=0&limit=10`)
			.set(authHeader(alice.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result.data).toEqual([expect.objectContaining({ id: senderMessage.data.id, message: "Hey lobby" })]);
			});
	});

	it("Redaguoja ir ištrina asmenines žinutes per WebSocket", async () => {
		await makeFriends();
		sendWs(aliceWs, { type: "SEND_DIRECT_CHAT_MESSAGE", targetUserId: bob.id, message: "Original" });
		const message = await waitForWsMessage(aliceWs, "DIRECT_CHAT_MESSAGE");
		await waitForWsMessage(bobWs, "DIRECT_CHAT_MESSAGE");

		sendWs(aliceWs, { type: "EDIT_DIRECT_CHAT_MESSAGE", messageId: message.data.id, message: "Edited" });
		await expect(waitForWsMessage(aliceWs, "DIRECT_CHAT_MESSAGE_EDITED")).resolves.toMatchObject({ data: { id: message.data.id, message: "Edited" } });
		await expect(waitForWsMessage(bobWs, "DIRECT_CHAT_MESSAGE_EDITED")).resolves.toMatchObject({ data: { id: message.data.id, message: "Edited" } });

		sendWs(aliceWs, { type: "DELETE_DIRECT_CHAT_MESSAGE", messageId: message.data.id });
		await expect(waitForWsMessage(aliceWs, "DIRECT_CHAT_MESSAGE_DELETED")).resolves.toEqual({ type: "DIRECT_CHAT_MESSAGE_DELETED", messageId: message.data.id });
		await expect(waitForWsMessage(bobWs, "DIRECT_CHAT_MESSAGE_DELETED")).resolves.toEqual({ type: "DIRECT_CHAT_MESSAGE_DELETED", messageId: message.data.id });
	});

	// Test helpers
	async function sendFriendRequest(): Promise<void> {
		sendWs(aliceWs, { type: "SEND_FRIEND_REQUEST", targetUsername: bob.username });
		await expect(waitForWsMessage(aliceWs, "SEND_FRIEND_REQUEST_OK")).resolves.toMatchObject({ targetUser: { id: bob.id } });
		await expect(waitForWsMessage(bobWs, "FRIEND_REQUEST_RECEIVED")).resolves.toMatchObject({ fromUser: { id: alice.id } });
	}

	async function makeFriends(): Promise<void> {
		await sendFriendRequest();
		sendWs(bobWs, { type: "ACCEPT_FRIEND_REQUEST", userId: alice.id });
		await waitForWsMessage(bobWs, "ACCEPT_FRIEND_REQUEST_OK");
		await waitForWsMessage(aliceWs, "FRIEND_REQUEST_ACCEPTED");
	}
});
