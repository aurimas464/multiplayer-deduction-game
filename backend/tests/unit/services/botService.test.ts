import { beforeEach, describe, expect, it, vi } from "vitest";
import botService from "../../../src/services/botService";
import { makeGameMessage, makeGameStatePlayer, makeLobbyPlayer, makeRole } from "./factories";

vi.mock("../../../src/repositories/botRepository", () => ({
	BotModel: {
		findBotPlayerById: vi.fn()
	}
}));

vi.mock("../../../src/repositories/gameBotSetupRepository", () => ({
	GameBotSetupModel: {
		upsert: vi.fn(),
		changeMemoryJson: vi.fn(),
		findByGameId: vi.fn(),
		findByGameIdAndPlayerId: vi.fn()
	}
}));

import { BotModel } from "../../../src/repositories/botRepository";
import { GameBotSetupModel } from "../../../src/repositories/gameBotSetupRepository";

const memory = {
	gameId: 1,
	playerId: 10,
	name: "Bot",
	profile: {
		talkStyle: { confidence: "medium", accusationRate: "medium", claimRate: "low", deceptionRate: "low", questionRate: "medium" },
		actionStyle: { voteRisk: "balanced", nightRisk: "balanced", targetPriority: [] }
	},
	ownRoleKey: "commoner",
	ownAlignment: "commune",
	availableRoles: [{ key: "commoner", alignment: "commune", weight: 1, description: "Commoner", nightActions: ["skip"] }],
	players: [{ playerId: 10, username: "Bot" }, { playerId: 11, username: "Target" }],
	phaseHistory: [],
	decisionHistory: []
};

const mockFetchJson = (content: string) => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
		ok: true,
		json: vi.fn().mockResolvedValue({ message: { content } })
	}));
};

describe("botService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.mocked(GameBotSetupModel.findByGameIdAndPlayerId).mockResolvedValue({ gameId: 1, playerId: 10, difficulty: "normal", playstyle: "balanced", memoryJson: memory });
		vi.mocked(GameBotSetupModel.changeMemoryJson).mockResolvedValue(true);
	});

	it("Boto žaidėjus suranda per botų repozitoriją", async () => {
		vi.mocked(BotModel.findBotPlayerById).mockResolvedValue({ id: 1, name: "Bot" });

		await expect(botService.findBotPlayerById(10)).resolves.toEqual({ id: 1, name: "Bot" });
	});

	it("Sugeneruoja boto atmintį iš laukiamojo kambario, rolių katalogo ir nustatymų", async () => {
		vi.mocked(BotModel.findBotPlayerById).mockResolvedValue({ id: 1, name: "Selina" });
		const ownRole = makeRole({ id: 2, key: "vampire", alignment: "vampire", weight: 3 });

		await botService.generateBotProfile(1, 10, { 10: { difficulty: "hard", playstyle: "aggressive" } }, [
			makeLobbyPlayer({ playerId: 10, username: "Selina" }),
			makeLobbyPlayer({ playerId: 11, username: "Bruce", type: "user" })
		], [ownRole, makeRole({ id: 1, key: "commoner", alignment: "commune" })], new Map([[10, ownRole]]));

		expect(GameBotSetupModel.upsert).toHaveBeenCalledWith({ gameId: 1, playerId: 10 });
		const storedMemory = vi.mocked(GameBotSetupModel.changeMemoryJson).mock.calls[0][2] as Record<string, unknown>;
		expect(storedMemory).toMatchObject({
			gameId: 1,
			playerId: 10,
			name: "Selina",
			ownRoleKey: "vampire",
			ownAlignment: "vampire"
		});
		expect(storedMemory.profile).toMatchObject({
			talkStyle: expect.objectContaining({ confidence: "high", accusationRate: "high" }),
			actionStyle: expect.objectContaining({ voteRisk: "risky", nightRisk: "risky" })
		});
		expect(storedMemory.players).toEqual([{ playerId: 10, username: "Selina" }, { playerId: 11, username: "Bruce" }]);
	});

	it("Papildo fazės rezultatų istoriją ir atnaujina atitinkamą sprendimą", async () => {
		vi.mocked(GameBotSetupModel.findByGameId).mockResolvedValue([
			{
				gameId: 1,
				playerId: 10,
				difficulty: "normal",
				playstyle: "balanced",
				memoryJson: {
					...memory,
					decisionHistory: [{ dayNumber: 1, phase: "voting", actionType: "vote", targetPlayerId: 11, reason: "sus" }]
				}
			}
		]);

		await botService.appendPhaseResultsToBots(1, "voting", 1, { eliminated: [{ playerId: 11, roleKey: "vampire" }] }, new Map([[10, [{ type: "inspect", targetPlayerId: 11, alignment: "bad" }]]]), new Map([[10, { playerId: 10, type: "vote", targetPlayerId: 11 }]]));

		const storedMemory = vi.mocked(GameBotSetupModel.changeMemoryJson).mock.calls[0][2] as Record<string, unknown>;
		expect(storedMemory.phaseHistory).toHaveLength(1);
		expect(storedMemory.decisionHistory).toEqual([
			expect.objectContaining({
				submittedAction: { playerId: 10, type: "vote", targetPlayerId: 11 },
				publicResult: { eliminated: [{ playerId: 11, roleKey: "vampire" }] }
			})
		]);
	});

	it("Iš tinkamo Ollama JSON atsakymo pasirenka balsavimo veiksmą ir įrašo sprendimą", async () => {
		mockFetchJson(JSON.stringify({ choiceIndex: 1, targetIndex: 1, reason: "clear contradiction" }));
		vi.mocked(GameBotSetupModel.findByGameIdAndPlayerId).mockResolvedValueOnce({
			gameId: 1,
			playerId: 10,
			difficulty: "hard",
			playstyle: "aggressive",
			memoryJson: {
				...memory,
				profile: {
					...memory.profile,
					actionStyle: { voteRisk: "risky", nightRisk: "balanced", targetPriority: ["players contradicting themselves"] }
				}
			}
		});

		const action = await botService.chooseVoteAction(1, 10, 2, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [makeGameMessage({ playerId: 11, message: "I changed my claim" })], 10_000);

		expect(action).toEqual({ playerId: 10, type: "vote", targetPlayerId: 11 });
		const fetchMock = globalThis.fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } };
		const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body) as { messages: Array<{ content: string }> };
		const promptPayload = JSON.parse(requestBody.messages[1].content) as { actionPlan: { riskLevel: string; riskChance: number; shouldTakeRisk: boolean; targetPriority: string[] }; botBehavior?: unknown };
		expect(promptPayload.botBehavior).toBeUndefined();
		expect(promptPayload.actionPlan).toEqual({ riskLevel: "risky", riskChance: 0.72, shouldTakeRisk: true, targetPriority: ["players contradicting themselves"] });
		expect(GameBotSetupModel.changeMemoryJson).toHaveBeenCalledWith(1, 10, expect.objectContaining({
			decisionHistory: [expect.objectContaining({ actionType: "vote", targetPlayerId: 11, reason: "clear contradiction" })]
		}));
	});

	it("Pasirenka praleidimą, kai balsavimo atsakymas netinkamas naudoti", async () => {
		mockFetchJson(JSON.stringify({ wrong: true }));

		await expect(botService.chooseVoteAction(1, 10, 2, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [], 10_000)).resolves.toEqual({ playerId: 10, type: "skip", targetPlayerId: null });
	});

	it("Praleidžia nakties veiksmą nekviesdamas Ollama, kai nėra leidžiamo rolės veiksmo", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		await expect(botService.chooseNightAction(1, 10, {
			roleKey: "commoner",
			dayNumber: 1,
			vampireMissedEliminationCycles: 0,
			hasUsedConvert: false,
			chroniclerCurrentRoleKey: null
		}, [
			makeGameStatePlayer({ playerId: 10 }),
			makeGameStatePlayer({ playerId: 11, seatNr: 2 })
		], [], 10_000)).resolves.toEqual({ playerId: 10, type: "skip", targetPlayerId: null });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("Iš Ollama JSON atsakymo pasirenka Vigilante eliminaciją be viešo įrodymo reikalavimo", async () => {
		mockFetchJson(JSON.stringify({ choiceIndex: 1, targetIndex: 0, reason: "check the claim" }));

		await expect(botService.chooseNightAction(1, 10, {
			roleKey: "vigilante",
			dayNumber: 2,
			vampireMissedEliminationCycles: 0,
			hasUsedConvert: false,
			chroniclerCurrentRoleKey: null
		}, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [], 10_000)).resolves.toEqual({
			playerId: 10,
			type: "eliminate",
			targetPlayerId: 11
		});
	});

	it("Sukuria išvalytas diskusijos žinutes ir įsimena priimtą boto tekstą", async () => {
		mockFetchJson(JSON.stringify({ message: "Bot: I have nothing solid yet.", reason: "safe first day" }));

		await expect(botService.createDiscussionMessage(1, 10, "day", 1, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [], 10_000)).resolves.toEqual({
			gameId: 1,
			playerId: 10,
			message: "I have nothing solid yet.",
			dayNumber: 1,
			phase: "day",
			messageType: "bot"
		});
	});

	it("Praleidžia tuščias diskusijos žinutes ir pasikartojančioms žinutėms naudoja atsarginį tekstą", async () => {
		mockFetchJson(JSON.stringify({ message: "", reason: "empty" }));
		await expect(botService.createDiscussionMessage(1, 10, "day", 1, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [], 10_000)).resolves.toBeNull();

		mockFetchJson(JSON.stringify({ message: "I have nothing solid yet.", reason: "same idea" }));
		await expect(botService.createDiscussionMessage(1, 10, "day", 1, [
			makeGameStatePlayer({ playerId: 10, username: "Bot" }),
			makeGameStatePlayer({ playerId: 11, username: "Target", seatNr: 2 })
		], [
			makeGameMessage({ playerId: 10, messageType: "bot", message: "I have nothing solid yet.", bot: { id: 1, name: "Bot", player: { id: 10, iconEtag: "etag" } }, user: null })
		], 10_000)).resolves.toMatchObject({
			messageType: "bot",
			message: expect.not.stringMatching(/^I have nothing solid yet\.$/)
		});
	});

	it("Išlaiko stabilų boto pagalbinių funkcijų veikimą skaidymui, URL normalizavimui ir pasikartojančio teksto tikrinimui", () => {
		const service = botService as unknown as {
			normalizeOllamaChatUrl: (url: string) => string;
			createActionChoices: (actions: string[]) => Array<{ choiceIndex: number; actionType: string; requiresTarget: boolean }>;
			readChoiceResult: (value: unknown) => unknown;
			createTargetMemory: (players: unknown[], playerId: number, includeSelf: boolean, includeKnownAlly: boolean) => unknown[];
			combineMessageLists: (left: string[], right: string[], limit: number) => string[];
			areMessagesTooSimilar: (left: string, right: string) => boolean;
			createNonRepeatingDiscussionFallback: (phase: string, dayNumber: number, playerId: number, recentMessages: string[]) => string | null;
			ensureMemoryObject: (memoryJson: unknown, gameId: number, playerId: number) => Record<string, unknown>;
		};

		expect(service.normalizeOllamaChatUrl("https://example.test///")).toBe("https://example.test/api/chat");
		expect(service.normalizeOllamaChatUrl("https://example.test/api/chat")).toBe("https://example.test/api/chat");
		expect(service.createActionChoices(["skip", "vote"])).toEqual([
			{ choiceIndex: 0, actionType: "skip", label: "Skip", requiresTarget: false },
			{ choiceIndex: 1, actionType: "vote", label: "vote", requiresTarget: true }
		]);
		expect(service.readChoiceResult({ choiceIndex: "1", targetIndex: "2", reason: "why" })).toEqual({ choiceIndex: 1, targetIndex: 2, reason: "why" });
		expect(service.readChoiceResult({ choiceIndex: "x", targetIndex: null })).toBeNull();
		expect(service.createTargetMemory([
			makeGameStatePlayer({ playerId: 10, isKnownAlly: false }),
			makeGameStatePlayer({ playerId: 11, isKnownAlly: true, seatNr: 2 }),
			makeGameStatePlayer({ playerId: 12, isEliminated: true, seatNr: 3 })
		], 10, false, false)).toEqual([]);
		expect(service.combineMessageLists(["Hi", "hi"], ["Different"], 5)).toEqual(["Hi", "Different"]);
		expect(service.areMessagesTooSimilar("I need a contradiction, not just a hunch.", "Need a contradiction, not just hunch")).toBe(true);
		expect(service.createNonRepeatingDiscussionFallback("voting", 1, 3, ["I'm not sold enough to push a vote."])).toEqual(expect.any(String));
		expect(service.ensureMemoryObject(null, 1, 10)).toEqual({ gameId: 1, playerId: 10 });
		expect(service.ensureMemoryObject({ ok: true }, 1, 10)).toEqual({ ok: true });
	});
});
