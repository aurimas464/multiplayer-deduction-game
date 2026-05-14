import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
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

// Mock files
vi.mock("node:fs/promises", () => ({
	mkdir: vi.fn(),
	readFile: vi.fn().mockRejectedValue(new Error("no cache")),
	writeFile: vi.fn()
}));

// Mock database
vi.mock("../../../prisma/client", () => ({
	default: prisma
}));

describe("statisticsService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const mutableService = statisticsService as unknown as { cache: unknown | null; cacheExpiresAt: number; refreshPromise: Promise<unknown> | null };
		mutableService.cache = null;
		mutableService.cacheExpiresAt = 0;
		mutableService.refreshPromise = null;
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

		const stats = await statisticsService.getPersonalStatistics(1, true);

		expect(stats.totals.games).toBe(0);
		expect(stats.games.topRoles).toEqual([]);
		expect(stats.lastManualRefresh).toBeGreaterThan(0);
	});

	it("Naudoja šviežią asmeninės statistikos kopiją ir saugo nuo per dažno rankinio atnaujinimo", async () => {
		const cachedStats = makeCachedStats({ updatedAt: Date.now(), lastManualRefresh: Date.now() });
		vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(cachedStats));

		await expect(statisticsService.getPersonalStatistics(1)).resolves.toEqual(cachedStats);
		expect(prisma.participant.findMany).not.toHaveBeenCalled();

		vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(cachedStats));
		await expect(statisticsService.getPersonalStatistics(1, true)).rejects.toMatchObject({ code: ErrorCode.TOO_SOON });
	});

	it("Sudaro asmeninę statistiką iš Prisma agregavimo užklausų", async () => {
		const stats = await statisticsService.getPersonalStatistics(1, true);

		expect(stats.totals).toMatchObject({
			games: 2,
			friendships: 1,
			directMessages: 3,
			gameMessages: 4,
			actions: 5,
			notes: 6
		});
		expect(stats.games.victories).toEqual([{ alignment: "commune", count: 1 }]);
		expect(stats.games.averages.durationSeconds).toEqual({ day: 60, voting: 30, night: 26 });
		expect(stats.games.topRoles).toEqual([{ roleKey: "commoner", count: 3 }]);
		expect(stats.games.topActions).toEqual([{ actionKey: "vote", count: 2 }]);
	});

	it("Pasenusią asmeninę kopiją perskaičiuoja ir nežinomoms rolėms priskiria atsarginę reikšmę", async () => {
		vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(makeCachedStats({ updatedAt: Date.now() - 48 * 60 * 60 * 1000, lastManualRefresh: 123 })));
		prisma.participant.groupBy.mockResolvedValueOnce([{ roleId: 99, _count: { _all: 1 } }]);
		prisma.role.findMany.mockResolvedValueOnce([]);

		const stats = await statisticsService.getPersonalStatistics(1);

		expect(stats.lastManualRefresh).toBe(123);
		expect(stats.games.topRoles).toEqual([{ roleKey: "unknown", count: 1 }]);
		expect(prisma.participant.findMany).toHaveBeenCalled();
	});

	it("Perskaičiuoja ir laikinai išsaugo globalią statistiką", async () => {
		const first = await statisticsService.getGlobalStatistics();
		const second = await statisticsService.getGlobalStatistics();

		expect(first).toBe(second);
		expect(first.totals.games).toBe(2);
		expect(first.games.popularGameSettings.roleDistributionMode).toEqual([{ value: undefined, count: 1 }]);
	});

	it("Globalioje statistikoje saugiai apskaičiuoja nulių ir tuščių agregacijų šakas", async () => {
		prisma.user.count.mockResolvedValue(0);
		prisma.game.count.mockResolvedValue(0);
		prisma.friendship.count.mockResolvedValue(0);
		prisma.directChat.count.mockResolvedValue(0);
		prisma.directChatMessage.count.mockResolvedValue(0);
		prisma.gameChatMessage.count.mockResolvedValue(0);
		prisma.action.count.mockResolvedValue(0);
		prisma.note.count.mockResolvedValue(0);
		prisma.participant.count.mockResolvedValue(0);
		prisma.game.groupBy.mockResolvedValue([]);
		prisma.participant.groupBy.mockResolvedValue([]);
		prisma.action.groupBy.mockResolvedValue([]);
		prisma.game.aggregate.mockResolvedValue({ _avg: { daySeconds: null, votingSeconds: null, nightSeconds: null } });

		const stats = await statisticsService.getGlobalStatistics();

		expect(stats.totals.games).toBe(0);
		expect(stats.games.averages).toMatchObject({
			participantsPerGame: 0,
			actionsPerGame: 0,
			gameMessagesPerGame: 0,
			directMessagesPerChat: 0,
			alivePlayersPerFinishedGame: 0,
			deadPlayersPerFinishedGame: 0,
			durationSeconds: { day: 0, voting: 0, night: 0 }
		});
		expect(stats.games.topRoles).toEqual([]);
	});
});

function makeCachedStats(overrides: Partial<{ updatedAt: number; lastManualRefresh: number }> = {}) {
	return {
		updatedAt: overrides.updatedAt ?? Date.now(),
		lastManualRefresh: overrides.lastManualRefresh ?? 0
	};
}
