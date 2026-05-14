import "../integration/setup/env";
import WebSocket, { type RawData } from "ws";

type BotStats = {
	requests: number;
	timeouts: number;
	skippedBeforeRequest: number;
};

type Metric = {
	label: "game_start" | "ws_ping";
	ms: number;
};

type PerformanceStep = {
	percent: number;
	sessions: number;
	realUsers: number;
	idleWsClients: number;
	totalBots: number;
};

type StepResult = PerformanceStep & {
	model: string;
	gamesStarted: number;
	activeWsConnections: number;
	botStats: BotStats;
	wsPingP95: number;
	gameStartP95: number;
	status: "ok" | "failed";
	error?: string;
};

type ProfileState = {
	server: import("../integration/helpers/ws").IntegrationServer;
	sockets: WebSocket[];
	gameSockets: WebSocket[];
	idleWsClients: number;
	gameBotCounts: number[];
};

type Runtime = {
	seed: () => Promise<void>;
	prisma: typeof import("../../prisma/client").default;
	wsHelpers: typeof import("../integration/helpers/ws");
	authHelpers: typeof import("../integration/helpers/auth");
	databaseHelpers: typeof import("../integration/helpers/database");
	gamePhaseService: typeof import("../../src/services/gamePhaseService").default;
	botRuntime: {
		llamaApiUrl: string;
		llamaModel: string;
		llamaApiKey: string;
		logBotFailure?: (message: string, details?: Record<string, unknown>) => void;
	};
};

type BotInstrumentation = {
	stats: BotStats;
	restore: () => void;
};

type PhaseGuard = {
	restore: () => void;
};

type ServerMessage = import("../../src/types/websocket/server").ServerMessage;
type GameStateData = Extract<ServerMessage, { type: "GAME_STATE" }>["data"];
type GameProgressMessage = Extract<ServerMessage, { type: "GAME_STATE" | "GAME_FINISHED" | "ERROR" }>;
type PhaseName = "day" | "voting" | "night";

type PhaseCheckpoint = {
	phase: PhaseName;
	dayNumber: number;
};

type ReportColumn<T> = {
	header: string;
	width: number;
	align?: "left" | "right";
	value: (row: T) => string | number;
};

const MIN_PLAYERS_PER_GAME = 5;
const MAX_PLAYERS_PER_GAME = 20;
const MIN_BOTS_PER_SESSION = MIN_PLAYERS_PER_GAME - 1;
const MAX_BOTS_PER_SESSION = MAX_PLAYERS_PER_GAME - 1;
const GAME_START_DELAY_MS = 10_000;

const DEFAULT_MODELS = "qwen3:1.7b,qwen3:4b,qwen3:14b";
const DEFAULT_TARGET_SESSIONS = 5;
const DEFAULT_TARGET_REAL_USERS = 10;
const DEFAULT_TARGET_BOTS = 25;

const models = parseModels(process.env.PERF_MODELS ?? DEFAULT_MODELS);
const stepPercents = parseStepPercents(process.env.PERF_STEPS ?? "20,40,60,80,100");
const targetSessions = readNumber("PERF_TARGET_SESSIONS", DEFAULT_TARGET_SESSIONS, 1);
const targetRealUsers = readNumber("PERF_TARGET_REAL_USERS", DEFAULT_TARGET_REAL_USERS, targetSessions);
const targetTotalBots = readNumber("PERF_TARGET_BOTS", DEFAULT_TARGET_BOTS, targetSessions * MIN_BOTS_PER_SESSION, targetSessions * MAX_BOTS_PER_SESSION);
const pingRounds = readNumber("PERF_PING_ROUNDS", 2, 0);
const gameStartedTimeoutMs = readNumber("PERF_GAME_STARTED_TIMEOUT_MS", 45_000, 1_000);
const phaseSeconds = 30;
const sessionStartStaggerMs = readNumber("PERF_SESSION_STAGGER_MS", 1_375, 0);
const cycleTimeoutMs = readNumber("PERF_CYCLE_TIMEOUT_MS", (phaseSeconds * 5 + 10) * 1000, 1_000);
const statePollIntervalMs = readNumber("PERF_STATE_POLL_INTERVAL_MS", 1_000, 100);
const stateRequestTimeoutMs = readNumber("PERF_STATE_REQUEST_TIMEOUT_MS", 5_000, 100);
const deterministicRandom = process.env.PERF_DETERMINISTIC_RANDOM !== "false";
const showProgress = process.env.PERF_SHOW_PROGRESS !== "false";

if (deterministicRandom) {
	Math.random = createSeededRandom(42);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const formatMs = (value: number): string => `${value.toFixed(1)}ms`;

async function main(): Promise<void> {
	const runtime = await createRuntime();
	const performanceSteps = stepPercents.map(buildPerformanceStep);

	printHeader();

	try {
		for (const model of models) {
			await runProfile(runtime, model, performanceSteps);
			console.log("");
		}
	} finally {
		await runtime.databaseHelpers.disconnectIntegrationDatabase();
	}
}

function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function readNumber(name: string, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
	const raw = process.env[name];
	const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);

	if (!Number.isFinite(value) || value < min || value > max) {
		throw new Error(`${name} must be a number from ${min} to ${max}. Received "${raw}".`);
	}

	return Math.floor(value);
}

function parseStepPercents(value: string): number[] {
	const steps = value
		.split(",")
		.map((part) => Number(part.trim()))
		.filter((part) => Number.isFinite(part));

	if (steps.length === 0) {
		throw new Error("PERF_STEPS must contain at least one percentage, for example 20,40,60,80,100.");
	}

	return [...new Set(steps)]
		.map((percent) => Math.max(1, Math.min(100, Math.floor(percent))))
		.sort((a, b) => a - b);
}

function parseModels(value: string): string[] {
	const parsedModels = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	if (parsedModels.length === 0) {
		throw new Error("PERF_MODELS must contain at least one model item.");
	}

	return parsedModels;
}

function buildPerformanceStep(percent: number): PerformanceStep {
	const ratio = percent / 100;
	const sessions = Math.max(1, Math.ceil(targetSessions * ratio));
	const realUsers = Math.max(sessions, Math.ceil(targetRealUsers * ratio));
	const idleWsClients = realUsers - sessions;
	const totalBots = Math.max(sessions * MIN_BOTS_PER_SESSION, Math.ceil(targetTotalBots * ratio));

	if (totalBots > sessions * MAX_BOTS_PER_SESSION) {
		throw new Error(`Performance step ${percent}% needs ${totalBots} bots across ${sessions} sessions, but each game supports at most ${MAX_BOTS_PER_SESSION} bots.`);
	}

	return { percent, sessions, realUsers, idleWsClients, totalBots };
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);

	return sorted[index];
}

function summarizeP95(label: Metric["label"], metrics: Metric[]): number {
	const values = metrics.filter((metric) => metric.label === label).map((metric) => metric.ms);
	return percentile(values, 95);
}

function statsDiff(after: BotStats, before: BotStats): BotStats {
	const requests = after.requests - before.requests;

	return {
		requests,
		timeouts: Math.min(after.timeouts - before.timeouts, requests),
		skippedBeforeRequest: after.skippedBeforeRequest - before.skippedBeforeRequest
	};
}

function copyStats(stats: BotStats): BotStats {
	return {
		requests: stats.requests,
		timeouts: stats.timeouts,
		skippedBeforeRequest: stats.skippedBeforeRequest
	};
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

async function createRuntime(): Promise<Runtime> {
	const [{ seed }, { default: prisma }, wsHelpers, authHelpers, databaseHelpers, botServiceModule, gamePhaseServiceModule] = await Promise.all([
		import("../../prisma/seed"),
		import("../../prisma/client"),
		import("../integration/helpers/ws"),
		import("../integration/helpers/auth"),
		import("../integration/helpers/database"),
		import("../../src/services/botService"),
		import("../../src/services/gamePhaseService")
	]);

	return {
		seed,
		prisma,
		wsHelpers,
		authHelpers,
		databaseHelpers,
		gamePhaseService: gamePhaseServiceModule.default,
		botRuntime: botServiceModule.default as unknown as Runtime["botRuntime"]
	};
}

async function runProfile(runtime: Runtime, model: string, performanceSteps: PerformanceStep[]): Promise<void> {
	const botInstrumentation = installBotInstrumentation(runtime.botRuntime);
	const phaseGuard = installPerformancePhaseGuard(runtime.gamePhaseService);
	const server = await runtime.wsHelpers.startIntegrationServer();
	const state: ProfileState = {
		server,
		sockets: [],
		gameSockets: [],
		idleWsClients: 0,
		gameBotCounts: []
	};

	if (process.env.PERF_OLLAMA_BASE_URL?.trim()) {
		runtime.botRuntime.llamaApiUrl = normalizeOllamaChatUrl(process.env.PERF_OLLAMA_BASE_URL.trim());
	}

	runtime.botRuntime.llamaModel = model;
	runtime.botRuntime.llamaApiKey = process.env.OLLAMA_API_KEY?.trim() || "";

	console.log(`\n${formatProfileTitle(model)}`);
	printTableHeader();

	try {
		await runtime.databaseHelpers.resetIntegrationDatabase();
		await runtime.seed();

		for (const step of performanceSteps) {
			const result = await runStep(runtime, botInstrumentation.stats, model, state, step);
			printStepResult(result);
			if (result.status === "failed") {
				throw new Error(result.error ?? "Performance step failed.");
			}
		}
	} finally {
		await Promise.all(state.sockets.map((ws) => runtime.wsHelpers.closeWs(ws)));
		await state.server.close();
		phaseGuard.restore();
		botInstrumentation.restore();
	}
}

async function runStep(runtime: Runtime, botStats: BotStats, model: string, state: ProfileState, step: PerformanceStep): Promise<StepResult> {
	const metrics: Metric[] = [];
	const beforeStats = copyStats(botStats);

	try {
		await addIdleClients(runtime, state, step);
		await pingSockets(runtime.wsHelpers, state.sockets, metrics, pingRounds);

		const newBotCounts = getNewSessionBotCounts(state, step);
		const newGameSockets = await startGamesWithStagger(runtime, state, metrics, step, newBotCounts);

		state.gameSockets.push(...newGameSockets);
		state.gameBotCounts.push(...newBotCounts);

		const gameSocketsToObserve = newGameSockets.length > 0 ? newGameSockets : state.gameSockets;
		const progressLabel = `${model} ${step.percent}%`;

		writeProgress(`${progressLabel}: laukiama žaidimo ciklo...`);
		try {
			await waitForOneGameCycle(runtime.wsHelpers, gameSocketsToObserve, progressLabel);
		} finally {
			clearProgress();
		}

		await pingSockets(runtime.wsHelpers, state.sockets, metrics, 1);

		return {
			...step,
			model,
			gamesStarted: state.gameBotCounts.length,
			activeWsConnections: state.sockets.length,
			botStats: statsDiff(botStats, beforeStats),
			wsPingP95: summarizeP95("ws_ping", metrics),
			gameStartP95: summarizeP95("game_start", metrics),
			status: "ok"
		};
	} catch (error) {
		clearProgress();

		return {
			...step,
			model,
			gamesStarted: state.gameBotCounts.length,
			activeWsConnections: state.sockets.length,
			botStats: statsDiff(botStats, beforeStats),
			wsPingP95: summarizeP95("ws_ping", metrics),
			gameStartP95: summarizeP95("game_start", metrics),
			status: "failed",
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

async function startGamesWithStagger(runtime: Runtime, state: ProfileState, metrics: Metric[], step: PerformanceStep, botCounts: number[]): Promise<WebSocket[]> {
	return await Promise.all(botCounts.map(async (botCount, index) => {
		// Staggering avoids every session entering the same phase at the same moment.
		if (index > 0 && sessionStartStaggerMs > 0) {
			await sleep(index * sessionStartStaggerMs);
		}

		return await startGame({
			runtime,
			state,
			metrics,
			botsPerSession: botCount,
			gameLabel: `perf_${step.percent}_${state.gameBotCounts.length + index}`
		});
	}));
}

async function startGame(args: { runtime: Runtime; state: ProfileState; metrics: Metric[]; botsPerSession: number; gameLabel: string }): Promise<WebSocket> {
	const { runtime, state, metrics, botsPerSession, gameLabel } = args;
	const roleSettings = await getRoleSettings(runtime.prisma, botsPerSession + 1);
	const owner = await runtime.authHelpers.registerAndLogin(state.server.app, `${gameLabel}_owner`);
	const ownerWs = await runtime.wsHelpers.connectAuthenticatedWs(state.server.url, owner.accessToken);
	attachServerHeartbeatResponder(ownerWs);
	state.sockets.push(ownerWs);

	const startedAt = performance.now();

	runtime.wsHelpers.sendWs(ownerWs, { type: "CREATE_GAME" });
	const created = await runtime.wsHelpers.waitForWsMessage(ownerWs, "CREATE_GAME_OK");

	runtime.wsHelpers.sendWs(ownerWs, { type: "JOIN_GAME", gameCode: created.gameCode });
	await runtime.wsHelpers.waitForWsMessage(ownerWs, "JOIN_GAME_OK");

	runtime.wsHelpers.sendWs(ownerWs, {
		type: "UPDATE_LOBBY_SETTINGS",
		// Keep generated games comparable and force exact action-capable roles.
		metaSettings: {
			maxPlayers: botsPerSession + 1,
			minPlayers: botsPerSession + 1,
			daySeconds: phaseSeconds,
			votingSeconds: phaseSeconds,
			nightSeconds: phaseSeconds,
			tieBehavior: "no_one_dies",
			roleDistributionMode: "exact"
		},
		roleSettings
	});
	await runtime.wsHelpers.waitForWsMessage(ownerWs, "UPDATE_LOBBY_SETTINGS_OK");

	for (let index = 0; index < botsPerSession; index++) {
		runtime.wsHelpers.sendWs(ownerWs, { type: "ADD_BOT" });
		await runtime.wsHelpers.waitForWsMessage(ownerWs, "ADD_BOT_OK");
	}

	runtime.wsHelpers.sendWs(ownerWs, { type: "SET_READY", ready: true });
	await runtime.wsHelpers.waitForWsMessage(ownerWs, "SET_READY_OK");
	await runtime.wsHelpers.waitForWsMessage(ownerWs, "GAME_STARTED", gameStartedTimeoutMs);

	// Exclude the fixed lobby countdown from the startup latency metric.
	const elapsedMs = performance.now() - startedAt;
	metrics.push({ label: "game_start", ms: Math.max(0, elapsedMs - GAME_START_DELAY_MS) });

	return ownerWs;
}

async function addIdleClients(runtime: Runtime, state: ProfileState, step: PerformanceStep): Promise<void> {
	const missingClients = step.idleWsClients - state.idleWsClients;
	if (missingClients <= 0) return;

	const newSockets = await Promise.all(Array.from({ length: missingClients }, async (_, offset) => {
		const clientIndex = state.idleWsClients + offset;
		const user = await runtime.authHelpers.registerAndLogin(state.server.app, `perf_idle_${step.percent}_${clientIndex}`);
		const ws = await runtime.wsHelpers.connectAuthenticatedWs(state.server.url, user.accessToken);
		attachServerHeartbeatResponder(ws);

		return ws;
	}));

	state.sockets.push(...newSockets);
	state.idleWsClients += missingClients;
}

function getNewSessionBotCounts(state: ProfileState, step: PerformanceStep): number[] {
	const existingSessions = state.gameBotCounts.length;
	const newSessionCount = step.sessions - existingSessions;
	const existingBots = sum(state.gameBotCounts);
	const botsToAdd = step.totalBots - existingBots;

	if (newSessionCount < 0 || botsToAdd < 0) {
		throw new Error(`Performance step ${step.percent}% is lower than the already running scenario.`);
	}

	if (newSessionCount === 0) {
		if (botsToAdd !== 0) {
			throw new Error(`Performance step ${step.percent}% requires ${botsToAdd} more bots but does not add new sessions.`);
		}

		return [];
	}

	return distributeBotsAcrossNewSessions(botsToAdd, newSessionCount);
}

function distributeBotsAcrossNewSessions(totalBots: number, sessionCount: number): number[] {
	const minBots = sessionCount * MIN_BOTS_PER_SESSION;
	const maxBots = sessionCount * MAX_BOTS_PER_SESSION;

	if (totalBots < minBots || totalBots > maxBots) {
		throw new Error(`Cannot distribute ${totalBots} bots across ${sessionCount} new sessions. Allowed range is ${minBots}-${maxBots}.`);
	}

	const base = Math.floor(totalBots / sessionCount);
	const remainder = totalBots % sessionCount;

	return Array.from({ length: sessionCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

async function getRoleSettings(prisma: Runtime["prisma"], totalPlayers: number): Promise<Record<number, number>> {
	const communeActionRoleKeys = ["visionary", "watchman", "jailor", "priest", "vigilante"];
	const roles = await prisma.role.findMany({ where: { key: { in: ["vampire", ...communeActionRoleKeys] } } });
	const vampire = roles.find((role) => role.key === "vampire");
	const communeActionRoles = communeActionRoleKeys.map((key) => roles.find((role) => role.key === key));

	if (!vampire || communeActionRoles.some((role) => !role)) {
		throw new Error("Performance test requires seeded vampire and commune action roles.");
	}

	const roleSettings: Record<number, number> = { [vampire.id]: 1 };
	for (let index = 0; index < totalPlayers - 1; index++) {
		const role = communeActionRoles[index % communeActionRoles.length];
		if (!role) continue;

		roleSettings[role.id] = (roleSettings[role.id] ?? 0) + 1;
	}

	return roleSettings;
}

async function waitForOneGameCycle(wsHelpers: Runtime["wsHelpers"], gameSockets: WebSocket[], progressLabel: string): Promise<void> {
	if (gameSockets.length === 0) return;

	const checkpoints: PhaseCheckpoint[] = [
		{ phase: "day", dayNumber: 2 },
		{ phase: "voting", dayNumber: 2 },
		{ phase: "night", dayNumber: 2 },
		{ phase: "day", dayNumber: 3 }
	];

	await Promise.all(gameSockets.map((ws, index) => waitForPhaseCheckpoints(
		wsHelpers,
		ws,
		checkpoints,
		`${progressLabel} ${index + 1}/${gameSockets.length}`
	)));
}

async function waitForPhaseCheckpoints(wsHelpers: Runtime["wsHelpers"], ws: WebSocket, checkpoints: PhaseCheckpoint[], progressLabel: string): Promise<void> {
	const deadline = performance.now() + cycleTimeoutMs;

	for (const checkpoint of checkpoints) {
		await waitForGamePhase(wsHelpers, ws, checkpoint, deadline, progressLabel);
	}
}

async function waitForGamePhase(wsHelpers: Runtime["wsHelpers"], ws: WebSocket, checkpoint: PhaseCheckpoint, deadline: number, progressLabel: string): Promise<void> {
	while (performance.now() < deadline) {
		try {
			const message = await requestGameProgressMessage(wsHelpers, ws);

			if (message.type === "GAME_FINISHED") {
				throw new Error("Game finished during performance test.");
			}
			if (message.type === "ERROR") {
				throw new Error(`Game state request failed with ${message.code}.`);
			}

			writePhaseProgress(progressLabel, message.data, checkpoint, deadline);

			if (hasReachedPhase(message.data.currentPhase, message.data.dayNumber, checkpoint)) {
				return;
			}
		} catch (error) {
			if (!isTimeoutError(error) || performance.now() >= deadline) {
				throw error;
			}
		}

		await sleep(statePollIntervalMs);
	}

	throw new Error(`Timed out waiting for day ${checkpoint.dayNumber} ${checkpoint.phase} phase.`);
}

function writePhaseProgress(progressLabel: string, state: GameStateData, checkpoint: PhaseCheckpoint, deadline: number): void {
	const remainingSeconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
	const current = `${formatPhaseName(state.currentPhase)} ${state.dayNumber}`;
	const expected = `${formatPhaseName(checkpoint.phase)} ${checkpoint.dayNumber}`;

	writeProgress(`${progressLabel}: dabar ${current}, laukiama ${expected}, iki ciklo limito ${remainingSeconds}s`);
}

function formatPhaseName(phase: PhaseName): string {
	switch (phase) {
		case "day":
			return "diena";
		case "voting":
			return "balsavimas";
		case "night":
			return "naktis";
	}
}

async function requestGameProgressMessage(wsHelpers: Runtime["wsHelpers"], ws: WebSocket): Promise<GameProgressMessage> {
	const pendingMessage = waitForGameProgressMessage(ws, stateRequestTimeoutMs);
	wsHelpers.sendWs(ws, { type: "REQUEST_GAME_STATE" });

	return pendingMessage;
}

function waitForGameProgressMessage(ws: WebSocket, timeoutMs: number): Promise<GameProgressMessage> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for game state or finish message."));
		}, timeoutMs);

		const onMessage = (raw: RawData) => {
			const message = JSON.parse(raw.toString()) as ServerMessage;
			if (message.type !== "GAME_STATE" && message.type !== "GAME_FINISHED" && message.type !== "ERROR") return;

			cleanup();
			resolve(message as GameProgressMessage);
		};

		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		const onClose = () => {
			cleanup();
			reject(new Error("WS connection closed while waiting for game state."));
		};

		const cleanup = () => {
			clearTimeout(timeout);
			ws.off("message", onMessage);
			ws.off("error", onError);
			ws.off("close", onClose);
		};

		ws.on("message", onMessage);
		ws.on("error", onError);
		ws.on("close", onClose);
	});
}

function attachServerHeartbeatResponder(ws: WebSocket): void {
	// Integration clients do not run the frontend WebSocketContext.
	ws.on("message", (raw: RawData) => {
		const message = JSON.parse(raw.toString()) as ServerMessage;
		if (message.type !== "PING" || ws.readyState !== WebSocket.OPEN) return;

		ws.send(JSON.stringify({ type: "PONG", t: message.t }));
	});
}

function hasReachedPhase(currentPhase: PhaseName, dayNumber: number, checkpoint: PhaseCheckpoint): boolean {
	return phaseOrder(dayNumber, currentPhase) >= phaseOrder(checkpoint.dayNumber, checkpoint.phase);
}

function phaseOrder(dayNumber: number, phase: PhaseName): number {
	const rank = phase === "day" ? 0 : phase === "voting" ? 1 : 2;
	return (dayNumber - 1) * 3 + rank;
}

async function pingSockets(wsHelpers: Runtime["wsHelpers"], sockets: WebSocket[], metrics: Metric[], rounds: number): Promise<void> {
	for (let round = 0; round < rounds; round++) {
		await Promise.all(sockets.map(async (ws) => {
			if (ws.readyState !== WebSocket.OPEN) return;

			const start = performance.now();
			const pongMessage = wsHelpers.waitForWsMessage(ws, "PONG");
			wsHelpers.sendWs(ws, { type: "PING", t: Date.now() });
			await pongMessage;
			metrics.push({ label: "ws_ping", ms: performance.now() - start });
		}));
	}
}

function printHeader(): void {
	console.log("=== WS ir botų našumo testas ===");
	console.log(`Tikslinė apkrova: ${targetSessions} sesijos, ${targetRealUsers} WS naudotojai, ${targetTotalBots} botai; fazės trukmė: ${phaseSeconds}s.`);
}

const reportColumns: Array<ReportColumn<StepResult>> = [
	{ header: "Apkrova", width: 8, value: (row) => `${row.percent}%` },
	{ header: "WS ryšiai", width: 9, align: "right", value: (row) => row.activeWsConnections },
	{ header: "Sesijos", width: 10, align: "right", value: (row) => `${row.gamesStarted}/${row.sessions}` },
	{ header: "Naudotojai", width: 10, align: "right", value: (row) => row.realUsers },
	{ header: "Botai", width: 7, align: "right", value: (row) => row.totalBots },
	{ header: "Paleidimo p95", width: 14, align: "right", value: (row) => formatMs(row.gameStartP95) },
	{ header: "Ping p95", width: 10, align: "right", value: (row) => formatMs(row.wsPingP95) },
	{ header: "DI užklausos", width: 12, align: "right", value: (row) => row.botStats.requests },
	{ header: "DI nutraukta", width: 12, align: "right", value: (row) => row.botStats.timeouts },
	{ header: "DI praleista", width: 12, align: "right", value: (row) => row.botStats.skippedBeforeRequest },
	{ header: "Klaidos", width: 8, align: "right", value: (row) => row.error ? 1 : 0 }
];

function writeProgress(message: string): void {
	if (!showProgress) return;
	process.stdout.write(`\r${message.padEnd(120)}`);
}

function clearProgress(): void {
	if (!showProgress) return;
	process.stdout.write(`\r${" ".repeat(120)}\r`);
}

function printTableHeader(): void {
	console.log(formatReportRow(reportColumns.map((column) => ({
		value: column.header,
		width: column.width,
		align: column.align
	}))));
	console.log(formatReportRow(reportColumns.map((column) => ({
		value: "-".repeat(column.header.length),
		width: column.width,
		align: column.align
	}))));
}

function printStepResult(result: StepResult): void {
	console.log(formatReportRow(reportColumns.map((column) => ({
		value: column.value(result),
		width: column.width,
		align: column.align
	}))));

	if (result.error) {
		console.log(`Klaida: ${result.error}`);
	}
}

function formatReportRow(cells: Array<{ value: string | number; width: number; align?: "left" | "right" }>): string {
	return cells
		.map((cell) => {
			const value = String(cell.value);
			return cell.align === "right" ? value.padStart(cell.width) : value.padEnd(cell.width);
		})
		.join("  ");
}

function formatProfileTitle(model: string): string {
	return `Modelis: ${model}`;
}

function normalizeOllamaChatUrl(baseUrl: string): string {
	const trimmed = baseUrl.replace(/\/+$/, "");
	return trimmed.endsWith("/api/chat") ? trimmed : `${trimmed}/api/chat`;
}

function installBotInstrumentation(botRuntime: Runtime["botRuntime"]): BotInstrumentation {
	const stats: BotStats = {
		requests: 0,
		timeouts: 0,
		skippedBeforeRequest: 0
	};
	const originalFetch = globalThis.fetch;
	const originalLogBotFailure = botRuntime.logBotFailure;
	const hadOwnLogBotFailure = Object.prototype.hasOwnProperty.call(botRuntime, "logBotFailure");

	const instrumentedFetch: typeof fetch = async (input, init) => {
		const url = getFetchUrl(input);
		if (!url.includes("/api/chat")) {
			return originalFetch(input, init);
		}

		stats.requests++;
		try {
			return await originalFetch(input, init);
		} catch (error) {
			if (isAbortError(error)) {
				stats.timeouts++;
			}

			throw error;
		}
	};

	if (originalLogBotFailure) {
		botRuntime.logBotFailure = (message, details) => {
			if (message.startsWith("Bot request skipped because too little phase time remained")) {
				stats.skippedBeforeRequest++;
			}

			originalLogBotFailure.call(botRuntime, message, details);
		};
	}

	globalThis.fetch = instrumentedFetch;

	return {
		stats,
		restore: () => {
			globalThis.fetch = originalFetch;
			if (hadOwnLogBotFailure) {
				botRuntime.logBotFailure = originalLogBotFailure;
			} else {
				delete botRuntime.logBotFailure;
			}
		}
	};
}

function installPerformancePhaseGuard(gamePhaseService: Runtime["gamePhaseService"]): PhaseGuard {
	const originalResolvePhase = gamePhaseService.resolvePhase.bind(gamePhaseService);

	gamePhaseService.resolvePhase = ((phase, pendingActions, playerStates, playerRoles, tieBehavior) => {
		const result = originalResolvePhase(phase, pendingActions, playerStates, playerRoles, tieBehavior);

		// The performance test measures a sustained running system, so phase
		// effects are computed but deaths and winners do not remove sessions.
		for (const state of playerStates.values()) {
			state.runtime.isEliminated = false;
		}
		result.phaseResult.eliminated = [];

		return { ...result, winner: null };
	}) as Runtime["gamePhaseService"]["resolvePhase"];

	return {
		restore: () => {
			gamePhaseService.resolvePhase = originalResolvePhase as Runtime["gamePhaseService"]["resolvePhase"];
		}
	};
}

function getFetchUrl(input: Parameters<typeof fetch>[0]): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();

	const requestLike = input as { url?: unknown };
	return typeof requestLike.url === "string" ? requestLike.url : String(input);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function isTimeoutError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Timed out waiting");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
