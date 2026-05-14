import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, wss } from "../../src/index";
import { ErrorCode } from "../../src/types";
import { authHeader, uniqueUsername } from "./helpers/auth";
import { disconnectIntegrationDatabase, resetIntegrationDatabase } from "./helpers/database";

// Test data
const password = "password123";

describe("Autentifikacijos integraciniai testai", () => {
	beforeEach(async () => {
		await resetIntegrationDatabase();
	});

	afterAll(async () => {
		await wss.close();
		await disconnectIntegrationDatabase();
	});

	it("Registruoja naudotoją ir sukuria susietą žaidėją", async () => {
		const username = uniqueUsername("auth_register");
		const email = `${username}@example.com`;

		const response = await registerUser(username, email);

		expect(response.body.success).toBe(true);
		expect(response.body.result).toMatchObject({
			username,
			email,
			player: expect.objectContaining({ id: expect.any(Number) })
		});
		expect(response.body.result.password).toBeUndefined();
	});

	it("Atmeta pasikartojantį naudotojo vardą", async () => {
		const username = uniqueUsername("auth_duplicate");

		await registerUser(username);

		const response = await request(app)
			.post("/api/auth/register")
			.send({ username, email: `${username}_second@example.com`, password })
			.expect(409);

		expect(response.body.success).toBe(false);
		expect(response.body.errors).toEqual([
			expect.objectContaining({ code: ErrorCode.VALUE_EXISTS, field: "username" })
		]);
	});

	it("Prisijungia naudotojo vardu ir grąžina prieigos raktą bei atnaujinimo slapuką", async () => {
		const username = uniqueUsername("auth_login");
		const email = `${username}@example.com`;

		await registerUser(username, email);

		const response = await request(app)
			.post("/api/auth/login")
			.send({ login: username, password })
			.expect(200);

		const cookies = responseCookies(response);
		expect(response.body.result.accessToken).toEqual(expect.any(String));
		expect(response.body.result.user).toMatchObject({ username, email });
		expect(cookies.some((cookie) => cookie.startsWith("refreshToken="))).toBe(true);
	});

	it("Atmeta neteisingus prisijungimo duomenis", async () => {
		const username = uniqueUsername("auth_invalid");

		await registerUser(username);

		const response = await request(app)
			.post("/api/auth/login")
			.send({ login: username, password: "wrong-password" })
			.expect(401);

		expect(response.body.success).toBe(false);
		expect(response.body.errors).toEqual([
			expect.objectContaining({ code: ErrorCode.INVALID_CREDENTIALS })
		]);
	});

	it("Atnaujina prieigos raktą su galiojančiu atnaujinimo slapuku", async () => {
		const username = uniqueUsername("auth_refresh");
		const email = `${username}@example.com`;
		const agent = request.agent(app);

		await agent
			.post("/api/auth/register")
			.send({ username, email, password })
			.expect(201);

		await agent
			.post("/api/auth/login")
			.send({ login: username, password })
			.expect(200);

		const refreshResponse = await agent
			.post("/api/auth/refresh")
			.expect(200);

		const accessToken = refreshResponse.body.result.accessToken;
		expect(accessToken).toEqual(expect.any(String));

		await request(app)
			.get("/api/users/getme")
			.set(authHeader(accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toMatchObject({ username, email });
		});
	});
});

// Test helpers
function registerUser(username: string, email = `${username}@example.com`) {
	return request(app)
		.post("/api/auth/register")
		.send({ username, email, password })
		.expect(201);
}

function responseCookies(response: request.Response): string[] {
	const rawCookies = response.headers["set-cookie"];
	return Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
}
