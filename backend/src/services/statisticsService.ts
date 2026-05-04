import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import prisma from "../../prisma/client";
import { AppError, ErrorCode } from "../types";

// Direct Prisma access is used here due to the high number of lightweight aggregate queries
// Introducing a repository layer would increase complexity without providing meaningful benefits

const CACHE_TTL_MS = 60 * 60 * 1000;
const PERSONAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PERSONAL_FORCE_REFRESH_COOLDOWN_MS = 60 * 1000;

const CACHE_ROOT = process.env.STATISTICS_CACHE_DIR ?? path.resolve(process.cwd(), "tmp");
const STATS_CACHE_FILE = path.resolve(CACHE_ROOT, "global-statistics.json");
const PERSONAL_STATS_CACHE_DIR = path.resolve(CACHE_ROOT, "personal-statistics");

type StatisticsSnapshot = {
	updatedAt: number;
	lastManualRefresh: number;
	totals: {
		games: number;
		friendships: number;
		directMessages: number;
		gameMessages: number;
		actions: number;
		notes: number;
	};
	games: {
		victories: Array<{ alignment: string; count: number }>;
		player: {
			wins: number;
			losses: number;
			aliveAtEnd: number;
			deadAtEnd: number;
		};
		popularGameSettings: {
			roleDistributionMode: Array<{ value: string; count: number }>;
			tieBehavior: Array<{ value: string; count: number }>;
			voteCountVisibility: Array<{ value: string; count: number }>;
			anonymousVoting: Array<{ value: boolean; count: number }>;
			roleRevealOnDeath: Array<{ value: boolean; count: number }>;
		};
		averages: {
			participantsPerGame: number;
			actionsPerGame: number;
			gameMessagesPerGame: number;
			directMessagesPerChat: number;
			alivePlayersPerFinishedGame: number;
			deadPlayersPerFinishedGame: number;
			durationSeconds: {
				day: number;
				voting: number;
				night: number;
			};
		};
		topRoles: Array<{ roleKey: string; count: number }>;
		topActions: Array<{ actionKey: string; count: number }>;
	};
	activity: {
		last24h: {
			usersCreated: number;
			gamesCreated: number;
			directMessagesSent: number;
			gameMessagesSent: number;
			actionsSaved: number;
		};
	};
};

class StatisticsService {
	private cache: StatisticsSnapshot | null = null;
	private cacheExpiresAt = 0;
	private refreshPromise: Promise<StatisticsSnapshot> | null = null;

	constructor() {
		this.loadCacheFromDisk().catch(() => undefined);

		const timer = setInterval(() => {
			void this.recomputeAndPersist();
		}, CACHE_TTL_MS);

		timer.unref?.();
	}

	async getGlobalStatistics(): Promise<StatisticsSnapshot> {
		if (this.cache && Date.now() < this.cacheExpiresAt) {
			return this.cache;
		}

		// Reuse the same refresh promise to avoid duplicate expensive recomputations
		if (!this.refreshPromise) {
			this.refreshPromise = this.recomputeAndPersist().finally(() => {
				this.refreshPromise = null;
			});
		}

		return this.refreshPromise;
	}

	async getPersonalStatistics(userId: number, forceRefresh = false): Promise<StatisticsSnapshot> {
		const now = new Date();
		const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const nowMs = now.getTime();

		const user = await prisma.user.findUnique({
			where: { id: userId },
			include: { userPlayer: true }
		});

		if (!user?.userPlayer) {
			throw new AppError(ErrorCode.USER_NOT_FOUND);
		}

		const cached = await this.loadPersonalStatisticsFromDisk(userId);

		if (forceRefresh && cached?.lastManualRefresh) {
			if (Date.now() - cached.lastManualRefresh < PERSONAL_FORCE_REFRESH_COOLDOWN_MS) {
				throw new AppError(ErrorCode.TOO_SOON);
			}
		}

		if (!forceRefresh && cached && Date.now() - cached.updatedAt < PERSONAL_CACHE_TTL_MS) {
			return cached;
		}

		const playerId = user.userPlayer.playerId;
		const playerGames = await prisma.participant.findMany({
			where: { playerId },
			select: { gameId: true }
		});
		const gameIds = [...new Set(playerGames.map((item) => item.gameId))];

		if (gameIds.length === 0) {
			const emptySnapshot = this.createEmptySnapshot(nowMs, forceRefresh ? nowMs : (cached?.lastManualRefresh ?? 0));
			await this.persistPersonalStatisticsToDisk(userId, emptySnapshot);

			return emptySnapshot;
		}

		const [
			totalGames,
			finishedGames,
			friendships,
			directChats,
			directMessages,
			gameMessages,
			actions,
			notes,
			participants,
			victoriesRaw,
			playerWins,
			playerLosses,
			aliveAtEnd,
			deadAtEnd,
			alivePlayersInFinishedGames,
			deadPlayersInFinishedGames,
			gamesByRoleDistribution,
			gamesByTieBehavior,
			gamesByVoteVisibility,
			gamesByAnonymousVoting,
			gamesByRoleReveal,
			topRolesRaw,
			topActionsRaw,
			usersLast24h,
			gamesLast24h,
			directMessagesLast24h,
			gameMessagesLast24h,
			actionsLast24h,
			avgDurations
		] = await Promise.all([
			prisma.game.count({ where: { id: { in: gameIds } } }),
			prisma.game.count({ where: { id: { in: gameIds }, status: "finished" } }),
			prisma.friendship.count({ where: { status: "accepted", OR: [{ userId1: userId }, { userId2: userId }] } }),
			prisma.directChat.count({ where: { friendship: { OR: [{ userId1: userId }, { userId2: userId }] } } }),
			prisma.directChatMessage.count({ where: { senderId: userId } }),
			prisma.gameChatMessage.count({ where: { playerId, gameId: { in: gameIds } } }),
			prisma.action.count({ where: { actorParticipantId: playerId, gameId: { in: gameIds } } }),
			prisma.note.count({ where: { userId } }),
			prisma.participant.count({ where: { gameId: { in: gameIds } } }),
			prisma.game.groupBy({ by: ["winnerAlignment"], where: { id: { in: gameIds }, winnerAlignment: { not: null } }, _count: { _all: true } }),
			prisma.participant.count({ where: { playerId, didWin: true, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.participant.count({ where: { playerId, didWin: false, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.participant.count({ where: { playerId, isAlive: true, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.participant.count({ where: { playerId, isAlive: false, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.participant.count({ where: { isAlive: true, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.participant.count({ where: { isAlive: false, gameId: { in: gameIds }, game: { status: "finished" } } }),
			prisma.game.groupBy({ by: ["roleDistributionMode"], where: { id: { in: gameIds } }, _count: { _all: true } }),
			prisma.game.groupBy({ by: ["tieBehavior"], where: { id: { in: gameIds } }, _count: { _all: true } }),
			prisma.game.groupBy({ by: ["voteCountVisibility"], where: { id: { in: gameIds } }, _count: { _all: true } }),
			prisma.game.groupBy({ by: ["anonymousVoting"], where: { id: { in: gameIds } }, _count: { _all: true } }),
			prisma.game.groupBy({ by: ["roleRevealOnDeath"], where: { id: { in: gameIds } }, _count: { _all: true } }),
			prisma.participant.groupBy({ by: ["roleId"], where: { playerId, roleId: { not: null } }, _count: { _all: true }, orderBy: { _count: { roleId: "desc" } }, take: 10 }),
			prisma.action.groupBy({ by: ["actionKey"], where: { actorParticipantId: playerId, gameId: { in: gameIds } }, _count: { _all: true }, orderBy: { _count: { actionKey: "desc" } }, take: 10 }),
			prisma.user.count({ where: { id: userId, createdAt: { gte: last24h } } }),
			prisma.game.count({ where: { id: { in: gameIds }, createdAt: { gte: last24h } } }),
			prisma.directChatMessage.count({ where: { senderId: userId, createdAt: { gte: last24h } } }),
			prisma.gameChatMessage.count({ where: { playerId, gameId: { in: gameIds }, createdAt: { gte: last24h } } }),
			prisma.action.count({ where: { actorParticipantId: playerId, gameId: { in: gameIds }, createdAt: { gte: last24h } } }),
			prisma.game.aggregate({ where: { id: { in: gameIds } }, _avg: { daySeconds: true, votingSeconds: true, nightSeconds: true } })
		]);

		const roleMap = await this.getRoleKeyMap(topRolesRaw.map((item) => item.roleId));

		const snapshot: StatisticsSnapshot = {
			updatedAt: nowMs,
			lastManualRefresh: forceRefresh ? nowMs : (cached?.lastManualRefresh ?? 0),
			totals: {
				games: totalGames,
				friendships,
				directMessages,
				gameMessages,
				actions,
				notes
			},
			games: {
				victories: victoriesRaw.map((item) => ({ alignment: item.winnerAlignment ?? "unknown", count: item._count._all })),
				player: {
					wins: playerWins,
					losses: playerLosses,
					aliveAtEnd,
					deadAtEnd
				},
				popularGameSettings: {
					roleDistributionMode: gamesByRoleDistribution.map((item) => ({ value: item.roleDistributionMode, count: item._count._all })),
					tieBehavior: gamesByTieBehavior.map((item) => ({ value: item.tieBehavior, count: item._count._all })),
					voteCountVisibility: gamesByVoteVisibility.map((item) => ({ value: item.voteCountVisibility, count: item._count._all })),
					anonymousVoting: gamesByAnonymousVoting.map((item) => ({ value: item.anonymousVoting, count: item._count._all })),
					roleRevealOnDeath: gamesByRoleReveal.map((item) => ({ value: item.roleRevealOnDeath, count: item._count._all }))
				},
				averages: {
					participantsPerGame: totalGames > 0 ? Number((participants / totalGames).toFixed(2)) : 0,
					actionsPerGame: totalGames > 0 ? Number((actions / totalGames).toFixed(2)) : 0,
					gameMessagesPerGame: totalGames > 0 ? Number((gameMessages / totalGames).toFixed(2)) : 0,
					directMessagesPerChat: directChats > 0 ? Number((directMessages / directChats).toFixed(2)) : 0,
					alivePlayersPerFinishedGame: finishedGames > 0 ? Number((alivePlayersInFinishedGames / finishedGames).toFixed(2)) : 0,
					deadPlayersPerFinishedGame: finishedGames > 0 ? Number((deadPlayersInFinishedGames / finishedGames).toFixed(2)) : 0,
					durationSeconds: {
						day: Math.round(avgDurations._avg.daySeconds ?? 0),
						voting: Math.round(avgDurations._avg.votingSeconds ?? 0),
						night: Math.round(avgDurations._avg.nightSeconds ?? 0)
					}
				},
				topRoles: topRolesRaw.map((item) => ({
					roleKey: item.roleId ? (roleMap.get(item.roleId) ?? "unknown") : "unknown",
					count: item._count._all
				})),
				topActions: topActionsRaw.map((item) => ({
					actionKey: item.actionKey,
					count: item._count._all
				}))
			},
			activity: {
				last24h: {
					usersCreated: usersLast24h,
					gamesCreated: gamesLast24h,
					directMessagesSent: directMessagesLast24h,
					gameMessagesSent: gameMessagesLast24h,
					actionsSaved: actionsLast24h
				}
			}
		};

		await this.persistPersonalStatisticsToDisk(userId, snapshot);

		return snapshot;
	}

	private async recomputeAndPersist(): Promise<StatisticsSnapshot> {
		const now = new Date();
		const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const nowMs = now.getTime();

		const [
			totalGames,
			finishedGames,
			friendships,
			directChats,
			directMessages,
			gameMessages,
			actions,
			notes,
			participants,
			victoriesRaw,
			playerWins,
			playerLosses,
			aliveAtEnd,
			deadAtEnd,
			gamesByRoleDistribution,
			gamesByTieBehavior,
			gamesByVoteVisibility,
			gamesByAnonymousVoting,
			gamesByRoleReveal,
			topRolesRaw,
			topActionsRaw,
			usersLast24h,
			gamesLast24h,
			directMessagesLast24h,
			gameMessagesLast24h,
			actionsLast24h,
			avgDurations
		] = await Promise.all([
			prisma.game.count(),
			prisma.game.count({ where: { status: "finished" } }),
			prisma.friendship.count({ where: { status: "accepted" } }),
			prisma.directChat.count(),
			prisma.directChatMessage.count(),
			prisma.gameChatMessage.count(),
			prisma.action.count(),
			prisma.note.count(),
			prisma.participant.count(),
			prisma.game.groupBy({ by: ["winnerAlignment"], where: { winnerAlignment: { not: null } }, _count: { _all: true } }),
			prisma.participant.count({ where: { didWin: true, game: { status: "finished" } } }),
			prisma.participant.count({ where: { didWin: false, game: { status: "finished" } } }),
			prisma.participant.count({ where: { isAlive: true, game: { status: "finished" } } }),
			prisma.participant.count({ where: { isAlive: false, game: { status: "finished" } } }),
			prisma.game.groupBy({ by: ["roleDistributionMode"], _count: { _all: true } }),
			prisma.game.groupBy({ by: ["tieBehavior"], _count: { _all: true } }),
			prisma.game.groupBy({ by: ["voteCountVisibility"], _count: { _all: true } }),
			prisma.game.groupBy({ by: ["anonymousVoting"], _count: { _all: true } }),
			prisma.game.groupBy({ by: ["roleRevealOnDeath"], _count: { _all: true } }),
			prisma.participant.groupBy({ by: ["roleId"], where: { roleId: { not: null } }, _count: { _all: true }, orderBy: { _count: { roleId: "desc" } }, take: 10 }),
			prisma.action.groupBy({ by: ["actionKey"], _count: { _all: true }, orderBy: { _count: { actionKey: "desc" } }, take: 10 }),
			prisma.user.count({ where: { createdAt: { gte: last24h } } }),
			prisma.game.count({ where: { createdAt: { gte: last24h } } }),
			prisma.directChatMessage.count({ where: { createdAt: { gte: last24h } } }),
			prisma.gameChatMessage.count({ where: { createdAt: { gte: last24h } } }),
			prisma.action.count({ where: { createdAt: { gte: last24h } } }),
			prisma.game.aggregate({ _avg: { daySeconds: true, votingSeconds: true, nightSeconds: true } })
		]);

		const roleMap = await this.getRoleKeyMap(topRolesRaw.map((item) => item.roleId));

		const snapshot: StatisticsSnapshot = {
			updatedAt: nowMs,
			lastManualRefresh: this.cache?.lastManualRefresh ?? 0,
			totals: {
				games: totalGames,
				friendships,
				directMessages,
				gameMessages,
				actions,
				notes
			},
			games: {
				victories: victoriesRaw.map((item) => ({ alignment: item.winnerAlignment ?? "unknown", count: item._count._all })),
				player: {
					wins: playerWins,
					losses: playerLosses,
					aliveAtEnd,
					deadAtEnd
				},
				popularGameSettings: {
					roleDistributionMode: gamesByRoleDistribution.map((item) => ({ value: item.roleDistributionMode, count: item._count._all })),
					tieBehavior: gamesByTieBehavior.map((item) => ({ value: item.tieBehavior, count: item._count._all })),
					voteCountVisibility: gamesByVoteVisibility.map((item) => ({ value: item.voteCountVisibility, count: item._count._all })),
					anonymousVoting: gamesByAnonymousVoting.map((item) => ({ value: item.anonymousVoting, count: item._count._all })),
					roleRevealOnDeath: gamesByRoleReveal.map((item) => ({ value: item.roleRevealOnDeath, count: item._count._all }))
				},
				averages: {
					participantsPerGame: totalGames > 0 ? Number((participants / totalGames).toFixed(2)) : 0,
					actionsPerGame: totalGames > 0 ? Number((actions / totalGames).toFixed(2)) : 0,
					gameMessagesPerGame: totalGames > 0 ? Number((gameMessages / totalGames).toFixed(2)) : 0,
					directMessagesPerChat: directChats > 0 ? Number((directMessages / directChats).toFixed(2)) : 0,
					alivePlayersPerFinishedGame: finishedGames > 0 ? Number((aliveAtEnd / finishedGames).toFixed(2)) : 0,
					deadPlayersPerFinishedGame: finishedGames > 0 ? Number((deadAtEnd / finishedGames).toFixed(2)) : 0,
					durationSeconds: {
						day: Math.round(avgDurations._avg.daySeconds ?? 0),
						voting: Math.round(avgDurations._avg.votingSeconds ?? 0),
						night: Math.round(avgDurations._avg.nightSeconds ?? 0)
					}
				},
				topRoles: topRolesRaw.map((item) => ({
					roleKey: item.roleId ? (roleMap.get(item.roleId) ?? "unknown") : "unknown",
					count: item._count._all
				})),
				topActions: topActionsRaw.map((item) => ({
					actionKey: item.actionKey,
					count: item._count._all
				}))
			},
			activity: {
				last24h: {
					usersCreated: usersLast24h,
					gamesCreated: gamesLast24h,
					directMessagesSent: directMessagesLast24h,
					gameMessagesSent: gameMessagesLast24h,
					actionsSaved: actionsLast24h
				}
			}
		};

		this.cache = snapshot;
		this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;

		await this.persistCacheToDisk(snapshot);

		return snapshot;
	}

	private createEmptySnapshot(updatedAt: number, lastManualRefresh: number): StatisticsSnapshot {
		return {
			updatedAt,
			lastManualRefresh,
			totals: {
				games: 0,
				friendships: 0,
				directMessages: 0,
				gameMessages: 0,
				actions: 0,
				notes: 0
			},
			games: {
				victories: [],
				player: {
					wins: 0,
					losses: 0,
					aliveAtEnd: 0,
					deadAtEnd: 0
				},
				popularGameSettings: {
					roleDistributionMode: [],
					tieBehavior: [],
					voteCountVisibility: [],
					anonymousVoting: [],
					roleRevealOnDeath: []
				},
				averages: {
					participantsPerGame: 0,
					actionsPerGame: 0,
					gameMessagesPerGame: 0,
					directMessagesPerChat: 0,
					alivePlayersPerFinishedGame: 0,
					deadPlayersPerFinishedGame: 0,
					durationSeconds: {
						day: 0,
						voting: 0,
						night: 0
					}
				},
				topRoles: [],
				topActions: []
			},
			activity: {
				last24h: {
					usersCreated: 0,
					gamesCreated: 0,
					directMessagesSent: 0,
					gameMessagesSent: 0,
					actionsSaved: 0
				}
			}
		};
	}

	private async getRoleKeyMap(roleIdsRaw: Array<number | null>): Promise<Map<number, string>> {
		const roleIds = roleIdsRaw.filter((id): id is number => id !== null);
		const roles = roleIds.length > 0
			? await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, key: true } })
			: [];

		return new Map(roles.map((role) => [role.id, role.key]));
	}

	private async persistCacheToDisk(snapshot: StatisticsSnapshot): Promise<void> {
		await mkdir(path.dirname(STATS_CACHE_FILE), { recursive: true });
		await writeFile(STATS_CACHE_FILE, JSON.stringify(snapshot), "utf8");
	}

	private async loadCacheFromDisk(): Promise<void> {
		await mkdir(path.dirname(STATS_CACHE_FILE), { recursive: true });

		const raw = await readFile(STATS_CACHE_FILE, "utf8");
		const parsed = JSON.parse(raw) as StatisticsSnapshot;

		if (!parsed.updatedAt) {
			return;
		}

		this.cache = parsed;
		this.cacheExpiresAt = parsed.updatedAt + CACHE_TTL_MS;
	}

	private personalStatsCacheFile(userId: number): string {
		return path.resolve(PERSONAL_STATS_CACHE_DIR, `${userId}.json`);
	}

	private async persistPersonalStatisticsToDisk(userId: number, snapshot: StatisticsSnapshot): Promise<void> {
		await mkdir(PERSONAL_STATS_CACHE_DIR, { recursive: true });
		await writeFile(this.personalStatsCacheFile(userId), JSON.stringify(snapshot), "utf8");
	}

	private async loadPersonalStatisticsFromDisk(userId: number): Promise<StatisticsSnapshot | null> {
		try {
			const raw = await readFile(this.personalStatsCacheFile(userId), "utf8");
			const parsed = JSON.parse(raw) as StatisticsSnapshot;

			if (!parsed.updatedAt) {
				return null;
			}

			return parsed;
		} catch {
			return null;
		}
	}
}

export default new StatisticsService();