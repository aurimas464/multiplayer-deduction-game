import { beforeEach, describe, expect, it, vi } from "vitest";
import userService from "../../../src/services/userService";
import { ErrorCode } from "../../../src/types";
import { makePlayer, makeUserWithPlayer } from "./factories";

vi.mock("../../../src/repositories/userRepository", () => ({
	UserModel: {
		findById: vi.fn(),
		patch: vi.fn()
	}
}));

vi.mock("../../../src/repositories/playerRepository", () => ({
	PlayerModel: {
		findByUserId: vi.fn(),
		findIconEtagByPlayerId: vi.fn(),
		findIconDataByPlayerIds: vi.fn()
	}
}));

vi.mock("../../../src/utils/validation", () => ({
	validateIcon: vi.fn()
}));

import { PlayerModel } from "../../../src/repositories/playerRepository";
import { UserModel } from "../../../src/repositories/userRepository";
import { validateIcon } from "../../../src/utils/validation";

describe("userService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("Grąžina dabartinį naudotoją su žaidėjo duomenimis", async () => {
		const user = makeUserWithPlayer();
		vi.mocked(UserModel.findById).mockResolvedValue(user);
		vi.mocked(PlayerModel.findByUserId).mockResolvedValue(user.player);

		await expect(userService.getMe(1)).resolves.toEqual({
			id: 1,
			username: "Aurimas",
			email: "aurimas@example.com",
			theme: "dark",
			colorTheme: "red",
			language: "en",
			player: { id: 10, iconEtag: "etag" }
		});
	});

	it("Grąžina klaidą, kai trūksta naudotojo arba žaidėjo", async () => {
		vi.mocked(UserModel.findById).mockResolvedValue(null);
		vi.mocked(PlayerModel.findByUserId).mockResolvedValue(makePlayer());

		await expect(userService.getMe(1)).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
	});

	it("Prieš atnaujinimą patikrina ir sumaišo ikonos duomenis", async () => {
		vi.mocked(validateIcon).mockResolvedValue({ ok: true, value: "  icon-data  " });

		await userService.patchUser({ id: 1, icon: "raw" });

		expect(UserModel.patch).toHaveBeenCalledWith({
			id: 1,
			icon: "  icon-data  ",
			iconEtag: userService.computeIconEtag("  icon-data  ")
		});
	});

	it("Atmeta netinkamas ikonas ir neatlieka atnaujinimo", async () => {
		vi.mocked(validateIcon).mockResolvedValue({ ok: false });

		await expect(userService.patchUser({ id: 1, icon: "bad" })).rejects.toMatchObject({ code: ErrorCode.INVALID_ICON });
		expect(UserModel.patch).not.toHaveBeenCalled();
	});

	it("Didelį ikonų užklausų kiekį apriboja iki pirmų dvidešimties unikalių id", async () => {
		vi.mocked(PlayerModel.findIconDataByPlayerIds).mockResolvedValue([
			{ id: 1, icon: "one" },
			{ id: 2, icon: "two" }
		]);

		const ids = [1, 1, ...Array.from({ length: 25 }, (_, index) => index + 2)];
		await expect(userService.getManyIcons(ids)).resolves.toEqual({ 1: "one", 2: "two" });

		const requestedIds = vi.mocked(PlayerModel.findIconDataByPlayerIds).mock.calls[0][0];
		expect(requestedIds).toHaveLength(20);
		expect(requestedIds.slice(0, 3)).toEqual([1, 2, 3]);
	});

	it("Ikonų etag reikšmes nuskaito tiesiai iš žaidėjų repozitorijos", async () => {
		vi.mocked(PlayerModel.findIconEtagByPlayerId).mockResolvedValue("etag");

		await expect(userService.getIconEtag(10)).resolves.toBe("etag");
	});
});
