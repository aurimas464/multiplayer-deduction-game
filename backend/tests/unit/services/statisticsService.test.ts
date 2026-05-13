import { beforeEach, describe, expect, it, vi } from "vitest";
import statisticsService from "../../../src/services/statisticsService";
import { ErrorCode } from "../../../src/types";

const prisma = vi.hoisted(() => ({
	user: { findUnique: vi.fn(), count: vi.fn() },
	participant: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
	game: { count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
	friendship: { count: vi.fn() },
	directChat: { count: vi.fn() },
	directChatMessage: { count: vi.fn() },
	gameChatMessage: { count: vi.fn() },
	action: { count: vi.fn(), groupBy: vi.fn() },
	note: { count: vi.fn() },
	role: { findMany: vi.fn() }
}));

vi.mock("node:fs/promises", () => ({
	mkdir: vi.fn(),
	readFile: vi.fn().mockRejectedValue(new Error("no cache")),
	writeFile: vi.fn()
}));

vi.mock("../../../prisma/client", () => ({
	default: prisma
}));

describe("statisticsService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prisma.user.findUnique.mockResolvedValue({ id: 1, userPlayer: { playerId: 10 } });
		prisma.participant.findMany.mockResolvedValue([{ gameId: 1 }, { gameId: 1 }, { gameId: 2 }]);
		prisma.user.count.mockResolvedValue(0);
		prisma.game.count.mockResolvedValue(2);
		prisma.friendship.count.mockResolvedValue(1);
		prisma.directChat.count.mockResolvedValue(1);
		prisma.directChatMessage.count.mockResolvedValue(3);
		prisma.gameChatMessage.count.mockResolvedValue(4);
		prisma.action.count.mockResolvedValue(5);
		prisma.note.count.mockResolvedValue(6);
		prisma.participant.count.mockResolvedValue(10);
		prisma.game.groupBy.mockResolvedValue([{ winnerAlignment: "commune", _count: { _all: 1 } }]);
		prisma.participant.groupBy.mockResolvedValue([{ roleId: 1, _count: { _all: 3 } }]);
		prisma.action.groupBy.mockResolvedValue([{ actionKey: "vote", _count: { _all: 2 } }]);
		prisma.game.aggregate.mockResolvedValue({ _avg: { daySeconds: 60.4, votingSeconds: 30.2, nightSeconds: 25.8 } });
		prisma.role.findMany.mockResolvedValue([{ id: 1, key: "commoner" }]);
	});

	it("Grąžina klaidą, kai asmeninės statistikos naudotojas neturi žaidėjo", async () => {
		prisma.user.findUnique.mockResolvedValueOnce(null);

		await expect(statisticsService.getPersonalStatistics(1)).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
	});

	it("Grąžina ir išsaugo tuščią asmeninę kopiją, kai naudotojas neturi žaidimų", async () => {
		prisma.participant.findMany.mockResolvedValueOnce([]);

		const snapshot = await statisticsService.getPersonalStatistics(1, true);

		expect(snapshot.totals.games).toBe(0);
		expect(snapshot.games.topRoles).toEqual([]);
		expect(snapshot.lastManualRefresh).toBeGreaterThan(0);
	});

	it("Sudaro asmeninę statistiką iš Prisma agregavimo užklausų", async () => {
		const snapshot = await statisticsService.getPersonalStatistics(1, true);

		expect(snapshot.totals).toMatchObject({
			games: 2,
			friendships: 1,
			directMessages: 3,
			gameMessages: 4,
			actions: 5,
			notes: 6
		});
		expect(snapshot.games.victories).toEqual([{ alignment: "commune", count: 1 }]);
		expect(snapshot.games.averages.durationSeconds).toEqual({ day: 60, voting: 30, night: 26 });
		expect(snapshot.games.topRoles).toEqual([{ roleKey: "commoner", count: 3 }]);
		expect(snapshot.games.topActions).toEqual([{ actionKey: "vote", count: 2 }]);
	});

	it("Perskaičiuoja ir laikinai išsaugo globalią statistiką", async () => {
		const first = await statisticsService.getGlobalStatistics();
		const second = await statisticsService.getGlobalStatistics();

		expect(first).toBe(second);
		expect(first.totals.games).toBe(2);
		expect(first.games.popularGameSettings.roleDistributionMode).toEqual([{ value: undefined, count: 1 }]);
	});
});
