import { describe, expect, it, vi } from "vitest";
import gamePhaseService from "../../../src/services/gamePhaseService";
import type { PlayerAction } from "../../../src/types/websocket/types";
import type { Role } from "../../../src/types/entities/role";
import { makePlayerState, makeRole } from "./factories";

type PlayerStateOverrides = Parameters<typeof makePlayerState>[0];

const states = (ids: number[], overrides: Record<number, PlayerStateOverrides> = {}) =>
	new Map(ids.map((id) => [id, makePlayerState(overrides[id])]));

const roles = (entries: Array<[number, Partial<Role>]>) =>
	new Map(entries.map(([id, role]) => [id, makeRole(role)]));

const actions = (entries: PlayerAction[]) =>
	new Map(entries.map((action) => [action.playerId, action]));

describe("gamePhaseService", () => {
	it("Išvalo laikiną dienos būseną nekeisdamas vykdymo būsenos", () => {
		const playerStates = states([1, 2], {
			1: { runtime: { isEliminated: true }, phase: { isProtected: true, wasProtectedFromElimination: true, visitedByPlayerIds: new Set([2]) } }
		});
		const playerRoles = roles([
			[1, { id: 1, key: "commoner", alignment: "commune" }],
			[2, { id: 2, key: "vampire", alignment: "vampire" }]
		]);

		gamePhaseService.resolvePhase("day", new Map(), playerStates, playerRoles, "no_one_dies");

		expect(playerStates.get(1)?.runtime.isEliminated).toBe(true);
		expect(playerStates.get(1)?.phase.isProtected).toBe(false);
		expect(playerStates.get(1)?.phase.wasProtectedFromElimination).toBe(false);
		expect(playerStates.get(1)?.phase.visitedByPlayerIds.size).toBe(0);
	});

	it("Eliminuoja daugiausia balsų gavusį taikinį ir suteikia Jester neutralią pergalę po balsavimo", () => {
		const playerStates = states([1, 2, 3]);
		const playerRoles = roles([
			[1, { id: 1, key: "jester", alignment: "neutral" }],
			[2, { id: 2, key: "commoner", alignment: "commune" }],
			[3, { id: 3, key: "vampire", alignment: "vampire" }]
		]);

		const result = gamePhaseService.resolvePhase("voting", actions([
			{ playerId: 2, type: "vote", targetPlayerId: 1 },
			{ playerId: 3, type: "vote", targetPlayerId: 1 }
		]), playerStates, playerRoles, "no_one_dies");

		expect(playerStates.get(1)?.runtime.isEliminated).toBe(true);
		expect(result.phaseResult.votes).toHaveLength(2);
		expect(result.phaseResult.eliminated).toEqual([{ playerId: 1, roleKey: "jester" }]);
		expect(result.winner).toEqual({ faction: "neutral", playerIds: [1] });
	});

	it("Balsams pasiskirsčius po lygiai palieka visus gyvus, kai lygiųjų taisyklė nurodo nieko neeliminuoti", () => {
		const playerStates = states([1, 2, 3]);
		const playerRoles = roles([
			[1, { id: 1, key: "commoner", alignment: "commune" }],
			[2, { id: 2, key: "commoner", alignment: "commune" }],
			[3, { id: 3, key: "vampire", alignment: "vampire" }]
		]);

		const result = gamePhaseService.resolvePhase("voting", actions([
			{ playerId: 1, type: "vote", targetPlayerId: 2 },
			{ playerId: 2, type: "vote", targetPlayerId: 3 }
		]), playerStates, playerRoles, "no_one_dies");

		expect(result.phaseResult.eliminated).toBeUndefined();
		expect([...playerStates.values()].every((state) => !state.runtime.isEliminated)).toBe(true);
	});

	it("Gali atsitiktinai išspręsti balsavimo lygiąsias, kai tai nustatyta konfigūracijoje", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		const playerStates = states([1, 2, 3]);
		const playerRoles = roles([
			[1, { id: 1, key: "commoner", alignment: "commune" }],
			[2, { id: 2, key: "commoner", alignment: "commune" }],
			[3, { id: 3, key: "vampire", alignment: "vampire" }]
		]);

		const result = gamePhaseService.resolvePhase("voting", actions([
			{ playerId: 1, type: "vote", targetPlayerId: 2 },
			{ playerId: 2, type: "vote", targetPlayerId: 3 }
		]), playerStates, playerRoles, "random_among_tied");

		expect(result.phaseResult.eliminated).toEqual([{ playerId: 3, roleKey: "vampire" }]);
	});

	it("Užblokuoja nakties eliminaciją su Priest apsauga ir grąžina privatų atsakymą", () => {
		const playerStates = states([1, 2, 3]);
		const playerRoles = roles([
			[1, { id: 1, key: "priest", alignment: "commune" }],
			[2, { id: 2, key: "commoner", alignment: "commune" }],
			[3, { id: 3, key: "vampire", alignment: "vampire" }]
		]);

		const result = gamePhaseService.resolvePhase("night", actions([
			{ playerId: 1, type: "protect", targetPlayerId: 2 },
			{ playerId: 3, type: "eliminate", targetPlayerId: 2 }
		]), playerStates, playerRoles, "no_one_dies");

		expect(playerStates.get(2)?.runtime.isEliminated).toBe(false);
		expect(playerStates.get(2)?.phase.wasProtectedFromElimination).toBe(true);
		expect(result.personalResults.get(1)).toContainEqual({ type: "protect", targetPlayerId: 2, wasAttacked: true });
		expect(result.personalResults.get(3)).toContainEqual({ type: "eliminate", targetPlayerId: 2 });
	});

	it("Apdoroja nakties informaciją, įkalinimą, pavertimą ir Chronicler spėjimus", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const playerStates = states([1, 2, 3, 4, 5], {
			5: { runtime: { chroniclerCurrentRoleKey: "vampire" } }
		});
		const playerRoles = roles([
			[1, { id: 1, key: "visionary", alignment: "commune" }],
			[2, { id: 2, key: "vampire", alignment: "vampire" }],
			[3, { id: 3, key: "jailor", alignment: "commune" }],
			[4, { id: 4, key: "count", alignment: "vampire" }],
			[5, { id: 5, key: "chronicler", alignment: "neutral" }]
		]);

		const result = gamePhaseService.resolvePhase("night", actions([
			{ playerId: 1, type: "inspect", targetPlayerId: 2 },
			{ playerId: 3, type: "jail", targetPlayerId: 2 },
			{ playerId: 4, type: "convert", targetPlayerId: 1 },
			{ playerId: 5, type: "guess", targetPlayerId: 2 }
		]), playerStates, playerRoles, "no_one_dies");

		expect(result.personalResults.get(1)).toContainEqual({ type: "inspect", targetPlayerId: 2, alignment: "bad" });
		expect(result.personalResults.get(3)).toContainEqual({ type: "jail", targetPlayerId: 2, applied: true });
		expect(result.personalResults.get(2)).toContainEqual({ type: "jailed" });
		expect(playerRoles.get(1)?.key).toBe("vampire");
		expect(playerStates.get(1)?.runtime.isConverted).toBe(true);
		expect(playerStates.get(5)?.runtime.chroniclerCorrectGuessCount).toBe(1);
		expect(result.personalResults.get(5)).toContainEqual({ type: "guess", targetPlayerId: 2, roleKey: "vampire", correct: true });
	});

	it("Pritaiko Vigilante bausmę, Serial Killer progresą ir vampyrų badavimą", () => {
		const playerStates = states([1, 2, 3], {
			3: { runtime: { vampireMissedEliminationCycles: 3 } }
		});
		const playerRoles = roles([
			[1, { id: 1, key: "vigilante", alignment: "commune" }],
			[2, { id: 2, key: "commoner", alignment: "commune" }],
			[3, { id: 3, key: "vampire", alignment: "vampire" }]
		]);

		const result = gamePhaseService.resolvePhase("night", actions([
			{ playerId: 1, type: "eliminate", targetPlayerId: 2 }
		]), playerStates, playerRoles, "no_one_dies");

		expect(playerStates.get(1)?.runtime.isEliminated).toBe(true);
		expect(playerStates.get(2)?.runtime.isEliminated).toBe(true);
		expect(playerStates.get(3)?.runtime.isEliminated).toBe(true);
		expect(result.phaseResult.eliminated).toEqual(expect.arrayContaining([
			{ playerId: 2, roleKey: "commoner" },
			{ playerId: 1, roleKey: "vigilante" },
			{ playerId: 3, roleKey: "vampire" }
		]));
	});
});
