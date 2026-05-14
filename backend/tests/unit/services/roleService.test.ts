import { beforeEach, describe, expect, it, vi } from "vitest";
import roleService from "../../../src/services/roleService";
import { ErrorCode } from "../../../src/types";
import { makeGame, makeParticipant, makeRole } from "./factories";

const gameTx = {
	findByGameId: vi.fn()
};
const participantTx = {
	findByGameId: vi.fn()
};
const roleSetupTx = {
	upsert: vi.fn()
};

// Mock database
vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

// Mock repositories
vi.mock("../../../src/repositories/roleRepository", () => ({
	RoleModel: {
		listRoles: vi.fn()
	}
}));

vi.mock("../../../src/repositories/gameRepository", () => ({
	GameModelTransaction: vi.fn(() => gameTx)
}));

vi.mock("../../../src/repositories/participantRepository", () => ({
	ParticipantModelTransaction: vi.fn(() => participantTx)
}));

vi.mock("../../../src/repositories/gameRoleSetupRepository", () => ({
	GameRoleSetupModelTransaction: vi.fn(() => roleSetupTx)
}));

import { RoleModel } from "../../../src/repositories/roleRepository";

describe("roleService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gameTx.findByGameId.mockResolvedValue(makeGame());
		participantTx.findByGameId.mockResolvedValue([makeParticipant({ playerId: 10, seatNr: 1 })]);
	});

	it("Grąžina rolių katalogą pagal atsakymo schemą", async () => {
		vi.mocked(RoleModel.listRoles).mockResolvedValue([makeRole({ id: 1, key: "commoner" })]);

		await expect(roleService.getRoles()).resolves.toEqual([{ id: 1, key: "commoner", alignment: "commune", weight: 1 }]);
	});

	it("Leidžia rolių nustatymus keisti tik laukiamojo kambario lyderiui", async () => {
		await expect(roleService.updateRoleSettings(10, 1, { 1: 2, 2: 3 })).resolves.toBe(true);

		expect(roleSetupTx.upsert).toHaveBeenCalledWith({ gameId: 1, roleId: 1, count: 2 });
		expect(roleSetupTx.upsert).toHaveBeenCalledWith({ gameId: 1, roleId: 2, count: 3 });
	});

	it("Atmeta neegzistuojančius žaidimus, aktyvius žaidimus ir ne lyderius", async () => {
		gameTx.findByGameId.mockResolvedValueOnce(null);
		await expect(roleService.updateRoleSettings(10, 1, { 1: 1 })).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND });

		gameTx.findByGameId.mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(roleService.updateRoleSettings(10, 1, { 1: 1 })).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });

		gameTx.findByGameId.mockResolvedValueOnce(makeGame());
		participantTx.findByGameId.mockResolvedValueOnce([makeParticipant({ playerId: 10, seatNr: 2 })]);
		await expect(roleService.updateRoleSettings(10, 1, { 1: 1 })).rejects.toMatchObject({ code: ErrorCode.NOT_GAME_LEADER });
	});
});
