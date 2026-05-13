import { beforeEach, describe, expect, it, vi } from "vitest";
import authService from "../../../src/services/authService";
import { ErrorCode } from "../../../src/types";
import { makeUserWithPlayer, now } from "./factories";

const userTx = {
	create: vi.fn()
};

vi.mock("../../../src/config", () => ({
	default: {
		jwtSecret: "test-secret",
		cookie: { maxAgeDays: 7 }
	}
}));

vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

vi.mock("bcryptjs", () => ({
	default: {
		hash: vi.fn(),
		compare: vi.fn()
	},
	hash: vi.fn(),
	compare: vi.fn()
}));

vi.mock("jsonwebtoken", () => ({
	default: {
		sign: vi.fn()
	},
	sign: vi.fn()
}));

vi.mock("uuid", () => ({
	v4: vi.fn()
}));

vi.mock("../../../src/repositories/userRepository", () => ({
	UserModel: {
		findByUsername: vi.fn(),
		findByEmail: vi.fn(),
		findByEmailOrName: vi.fn(),
		findById: vi.fn()
	},
	UserModelTransaction: vi.fn(() => userTx)
}));

vi.mock("../../../src/repositories/sessionRepository", () => ({
	SessionModel: {
		create: vi.fn(),
		findByValidTokenHash: vi.fn(),
		rotateByTokenHash: vi.fn(),
		deleteByTokenHash: vi.fn()
	}
}));

vi.mock("../../../src/repositories/playerRepository", () => ({
	PlayerModel: {
		findByUserId: vi.fn()
	}
}));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { PlayerModel } from "../../../src/repositories/playerRepository";
import { SessionModel } from "../../../src/repositories/sessionRepository";
import { UserModel } from "../../../src/repositories/userRepository";

describe("authService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(bcrypt.hash).mockResolvedValue("hashed" as never);
		vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
		vi.mocked(jwt.sign).mockReturnValue("access-token" as never);
		vi.mocked(uuidv4).mockReturnValue("refresh-token" as never);
		userTx.create.mockResolvedValue(makeUserWithPlayer({ password: "hashed" }));
	});

	it("Transakcijoje registruoja unikalius naudotojus su maišytu slaptažodžiu", async () => {
		vi.mocked(UserModel.findByUsername).mockResolvedValue(null);
		vi.mocked(UserModel.findByEmail).mockResolvedValue(null);

		await expect(authService.register({ username: "Aurimas", email: "a@example.com", password: "password123" })).resolves.toEqual({
			id: 1,
			username: "Aurimas",
			email: "aurimas@example.com",
			theme: "dark",
			colorTheme: "red",
			language: "en",
			player: { id: 10, iconEtag: "etag" }
		});

		expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
		expect(userTx.create).toHaveBeenCalledWith({ username: "Aurimas", email: "a@example.com", password: "hashed" });
	});

	it("Prieš maišymą atmeta pasikartojančius naudotojo vardus ir el. paštus", async () => {
		vi.mocked(UserModel.findByUsername).mockResolvedValueOnce(makeUserWithPlayer());
		await expect(authService.register({ username: "Aurimas", email: "a@example.com", password: "password123" })).rejects.toMatchObject({
			code: ErrorCode.VALUE_EXISTS,
			details: [{ field: "username", code: ErrorCode.VALUE_EXISTS }]
		});

		vi.mocked(UserModel.findByUsername).mockResolvedValueOnce(null);
		vi.mocked(UserModel.findByEmail).mockResolvedValueOnce(makeUserWithPlayer());
		await expect(authService.register({ username: "Aurimas", email: "a@example.com", password: "password123" })).rejects.toMatchObject({
			code: ErrorCode.VALUE_EXISTS,
			details: [{ field: "email", code: ErrorCode.VALUE_EXISTS }]
		});
	});

	it("Prisijungia su tinkamais duomenimis ir sukuria atnaujinimo sesiją", async () => {
		const user = makeUserWithPlayer({ id: 1, player: { id: 22, iconEtag: "etag" } });
		vi.mocked(UserModel.findByEmailOrName).mockResolvedValue(user);
		vi.mocked(PlayerModel.findByUserId).mockResolvedValue(user.player);
		vi.mocked(SessionModel.create).mockResolvedValue({ id: 1, userId: 1, refreshTokenHash: "hash", refreshExpiresAt: now, createdAt: now, updatedAt: now });

		await expect(authService.login("aurimas", "password123")).resolves.toMatchObject({
			accessToken: "access-token",
			refreshToken: "refresh-token",
			userData: { id: 1, username: "Aurimas", player: { id: 22, iconEtag: "etag" } }
		});
		expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, playerId: 22 }), "test-secret", { expiresIn: "1h", algorithm: "HS256" });
		expect(SessionModel.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, refreshTokenHash: expect.any(String) }));
	});

	it("Atmeta netinkamus prisijungimo duomenis ir trūkstamus žaidėjo įrašus", async () => {
		vi.mocked(UserModel.findByEmailOrName).mockResolvedValueOnce(null);
		await expect(authService.login("missing", "password")).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });

		vi.mocked(UserModel.findByEmailOrName).mockResolvedValueOnce(makeUserWithPlayer());
		vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
		await expect(authService.login("aurimas", "bad")).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });

		vi.mocked(UserModel.findByEmailOrName).mockResolvedValueOnce(makeUserWithPlayer());
		vi.mocked(PlayerModel.findByUserId).mockResolvedValueOnce(null);
		await expect(authService.login("aurimas", "password")).rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
	});

	it("Pakeičia atnaujinimo žetonus ir atmeta pasibaigusius arba jau pakeistus žetonus", async () => {
		const user = makeUserWithPlayer({ id: 1, player: { id: 22, iconEtag: "etag" } });
		vi.mocked(SessionModel.findByValidTokenHash).mockResolvedValue({ id: 1, userId: 1, refreshTokenHash: "hash", refreshExpiresAt: now, createdAt: now, updatedAt: now });
		vi.mocked(UserModel.findById).mockResolvedValue(user);
		vi.mocked(PlayerModel.findByUserId).mockResolvedValue(user.player);
		vi.mocked(SessionModel.rotateByTokenHash).mockResolvedValue(1);

		await expect(authService.refresh("old-refresh")).resolves.toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });

		vi.mocked(SessionModel.findByValidTokenHash).mockResolvedValueOnce(null);
		await expect(authService.refresh("expired")).rejects.toMatchObject({ code: ErrorCode.EXPIRED_TOKEN });

		vi.mocked(SessionModel.findByValidTokenHash).mockResolvedValueOnce({ id: 1, userId: 1, refreshTokenHash: "hash", refreshExpiresAt: now, createdAt: now, updatedAt: now });
		vi.mocked(UserModel.findById).mockResolvedValueOnce(user);
		vi.mocked(PlayerModel.findByUserId).mockResolvedValueOnce(user.player);
		vi.mocked(SessionModel.rotateByTokenHash).mockResolvedValueOnce(0);
		await expect(authService.refresh("raced")).rejects.toMatchObject({ code: ErrorCode.EXPIRED_TOKEN });
	});

	it("Prieš atsijungimo trynimą sumaišo atnaujinimo žetoną", async () => {
		await authService.logout("refresh-token");

		expect(SessionModel.deleteByTokenHash).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
	});
});
