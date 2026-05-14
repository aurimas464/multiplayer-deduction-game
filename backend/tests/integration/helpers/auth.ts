import request from "supertest";
import type { Express } from "express";

export type TestUser = {
	id: number;
	username: string;
	email: string;
	playerId: number;
	accessToken: string;
};

let counter = 0;

export function uniqueUsername(label: string): string {
	counter++;
	return `it_${label}_${Date.now()}_${counter}`;
}

export async function registerAndLogin(app: Express, label: string): Promise<TestUser> {
	const username = uniqueUsername(label);
	const email = `${username}@example.com`;
	const password = "password123";

	await request(app)
		.post("/api/auth/register")
		.send({ username, email, password })
		.expect(201);

	const loginResponse = await request(app)
		.post("/api/auth/login")
		.send({ login: username, password })
		.expect(200);

	const result = loginResponse.body.result;

	return {
		id: result.user.id,
		username,
		email,
		playerId: result.user.player.id,
		accessToken: result.accessToken
	};
}

export function authHeader(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}
