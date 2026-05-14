import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, wss } from "../../src/index";
import { authHeader, registerAndLogin, type TestUser } from "./helpers/auth";
import { disconnectIntegrationDatabase, resetIntegrationDatabase } from "./helpers/database";

// Test data
const noteContent = "Watch voting patterns";

describe("Naudotojo duomenų integraciniai testai", () => {
	let user: TestUser;
	let other: TestUser;

	beforeEach(async () => {
		await resetIntegrationDatabase();
		user = await registerAndLogin(app, "notes_settings");
		other = await registerAndLogin(app, "notes_other");
	});

	afterAll(async () => {
		await wss.close();
		await disconnectIntegrationDatabase();
	});

	it("Atmeta užrašų užklausas be prieigos rakto", async () => {
		await request(app)
			.get("/api/notes/get")
			.expect(401);
	});

	it("Sukuria užrašą ir grąžina autentifikuoto naudotojo užrašų sąrašą", async () => {
		await createNote(user, "Day 1", noteContent);

		await request(app)
			.get("/api/notes/get")
			.set(authHeader(user.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toEqual([
					expect.objectContaining({ title: "Day 1", content: noteContent })
				]);
			});
	});

	it("Neleidžia kitam naudotojui skaityti privataus užrašo", async () => {
		const created = await createNote(user, "Private", "Only mine");

		await request(app)
			.get(`/api/notes/get/${created.body.result.id}`)
			.set(authHeader(other.accessToken))
			.expect(401);
	});

	it("Atnaujina ir ištrina naudotojui priklausantį užrašą", async () => {
		const created = await createNote(user, "Day 2", "Initial");

		await request(app)
			.patch(`/api/notes/update/${created.body.result.id}`)
			.set(authHeader(user.accessToken))
			.send({ content: "Updated" })
			.expect(200);

		await request(app)
			.get(`/api/notes/get/${created.body.result.id}`)
			.set(authHeader(user.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toMatchObject({ title: "Day 2", content: "Updated" });
			});

		await request(app)
			.delete(`/api/notes/delete/${created.body.result.id}`)
			.set(authHeader(user.accessToken))
			.expect(200);

		await request(app)
			.get("/api/notes/get")
			.set(authHeader(user.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toEqual([]);
			});
	});

	it("Išsaugo nustatymus per getMe užklausą ir pakartotinį prisijungimą", async () => {
		await request(app)
			.patch("/api/users/patch")
			.set(authHeader(user.accessToken))
			.send({ theme: "light", colorTheme: "gold", language: "lt" })
			.expect(200);

		await request(app)
			.get("/api/users/getme")
			.set(authHeader(user.accessToken))
			.expect(200)
			.expect((res) => {
				expect(res.body.result).toMatchObject({
					email: user.email,
					theme: "light",
					colorTheme: "gold",
					language: "lt"
				});
			});

		const relogin = await request(app)
			.post("/api/auth/login")
			.send({ login: user.username, password: "password123" })
			.expect(200);

		expect(relogin.body.result.user).toMatchObject({
			email: user.email,
			theme: "light",
			colorTheme: "gold",
			language: "lt"
		});
	});
});

// Test helpers
function createNote(owner: TestUser, title: string, content: string) {
	return request(app)
		.post("/api/notes/create")
		.set(authHeader(owner.accessToken))
		.send({ title, content })
		.expect(200);
}
