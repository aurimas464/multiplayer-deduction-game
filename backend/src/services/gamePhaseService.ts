import type { FinishedGameWinner, PersonalPhaseResult, PhaseResult, PlayerAction, PlayerState } from "../types/websocket/types";
import type { PhaseType, TieBehavior } from "../types/entities/game";
import type { Role } from "../types/entities/role";

class GamePhaseService {
	// Resolves one phase and mutates player states/roles directly
	public resolvePhase(phase: PhaseType, pendingActions: Map<number, PlayerAction>, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, tieBehavior: TieBehavior)
	: { playerStates: Map<number, PlayerState>, phaseResult: PhaseResult, personalResults: Map<number, PersonalPhaseResult[]>, winner: FinishedGameWinner | null } {
		const phaseResult: PhaseResult = {};
		const personalResults = new Map<number, PersonalPhaseResult[]>();

		switch (phase) {
			case "day":
				// Day start clears temporary night effects
				this.resetPhaseState(playerStates);
				break;
			case "voting":
				// Voting resolves public votes and possible execution
				this.resolveVoting(pendingActions, playerStates, playerRoles, tieBehavior, phaseResult);
				break;
			case "night":
				// Night resolves role actions in a fixed order
				this.resetJails(playerStates);
				this.resolveNight(pendingActions, playerStates, playerRoles, phaseResult, personalResults);
				break;
		}

		const winner = this.resolveWinner(phase, playerStates, playerRoles, phaseResult);

		return { playerStates, phaseResult, personalResults, winner };
	}

	private resetPhaseState(playerStates: Map<number, PlayerState>): void {
		for (const state of playerStates.values()) {
			state.phase.visitedByPlayerIds = new Set();
			state.phase.isProtected = false;
			state.phase.wasProtectedFromElimination = false;
		}
	}

	private resetJails(playerStates: Map<number, PlayerState>): void {
		for (const state of playerStates.values()) {
			state.phase.isJailed = false;
		}
	}

	private resolveVoting(pendingActions: Map<number, PlayerAction>, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, tieBehavior: TieBehavior, phaseResult: PhaseResult): void {
		const skipVoteId = -1;
		const voteCounts = new Map<number, number>();

		// Collect votes
		phaseResult.votes = [];
		for (const action of pendingActions.values()) {
			switch (action.type) {
				case "vote":
					if (action.targetPlayerId === null) break;

					phaseResult.votes.push({ voterPlayerId: action.playerId, targetPlayerId: action.targetPlayerId });
					voteCounts.set(action.targetPlayerId, (voteCounts.get(action.targetPlayerId) ?? 0) + 1);
					break;

				case "skip":
					phaseResult.votes.push({ voterPlayerId: action.playerId, targetPlayerId: null });
					voteCounts.set(skipVoteId, (voteCounts.get(skipVoteId) ?? 0) + 1);
					break;
			}
		}

		// Find highest vote count and tied players
		let highestVoteCount = 0;
		const tiedPlayerIds: number[] = [];
		for (const [playerId, voteCount] of voteCounts) {
			if (voteCount > highestVoteCount) {
				highestVoteCount = voteCount;
				tiedPlayerIds.length = 0;
				tiedPlayerIds.push(playerId);
				continue;
			}

			if (voteCount === highestVoteCount) {
				tiedPlayerIds.push(playerId);
			}
		}

		if (highestVoteCount === 0) return;
		// Determine eliminated player based on tie behavior
		let eliminatedPlayerId: number | null;
		if (tiedPlayerIds.length === 1) {
			eliminatedPlayerId = tiedPlayerIds[0];
		} else {
			switch (tieBehavior) {
				case "random_among_tied":
					eliminatedPlayerId = tiedPlayerIds[Math.floor(Math.random() * tiedPlayerIds.length)];
					break;
				case "no_one_dies":
				default:
					eliminatedPlayerId = null;
					break;
			}
		}

		if (eliminatedPlayerId === null || eliminatedPlayerId === skipVoteId) return;
		this.eliminatePlayer(eliminatedPlayerId, playerStates, playerRoles, phaseResult);
	}

	// Resolves night actions in dependency-safe order
	private resolveNight(pendingActions: Map<number, PlayerAction>, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult, personalResults: Map<number, PersonalPhaseResult[]>): void {
		const actions = Array.from(pendingActions.values());

		this.registerVisits(actions, playerStates);
		this.applyProtection(actions, playerStates);
		this.applyJails(actions, playerStates, personalResults);
		this.applyInformationActions(actions, playerStates, playerRoles, personalResults);
		this.applyEliminations(actions, playerStates, playerRoles, phaseResult, personalResults);
		this.applyConversions(actions, playerStates, playerRoles, personalResults);
		this.applyVampireMissedEliminationCycles(actions, playerStates, playerRoles, phaseResult);
		this.applyVampireStarvation(playerStates, playerRoles, phaseResult);
		this.applyPriestResults(actions, playerStates, personalResults);
		this.assignChroniclerRoles(playerStates, playerRoles, personalResults);
	}

	// Records all targeted players so Watchman can see attempted visits
	private registerVisits(actions: PlayerAction[], playerStates: Map<number, PlayerState>): void {
		for (const action of actions) {
			if (action.targetPlayerId === null) continue;

			const targetState = playerStates.get(action.targetPlayerId);
			if (!targetState) continue;

			targetState.phase.visitedByPlayerIds.add(action.playerId);
		}
	}

	// Applies Priest protection before eliminations are resolved
	private applyProtection(actions: PlayerAction[], playerStates: Map<number, PlayerState>): void {
		for (const action of actions) {
			if (action.type !== "protect" || action.targetPlayerId === null) continue;

			const targetState = playerStates.get(action.targetPlayerId);
			if (!targetState) continue;

			targetState.phase.isProtected = true;
		}
	}

	// Applies Jailor block for the following day and voting phase
	private applyJails(actions: PlayerAction[], playerStates: Map<number, PlayerState>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const action of actions) {
			if (action.type !== "jail" || action.targetPlayerId === null) continue;

			const targetState = playerStates.get(action.targetPlayerId);
			if (!targetState) continue;

			targetState.phase.isJailed = true;

			this.addPersonalResult(personalResults, action.playerId, { type: "jail", targetPlayerId: action.targetPlayerId, applied: true });
			this.addPersonalResult(personalResults, action.targetPlayerId, { type: "jailed" });
		}
	}

	// Resolves information actions
	private applyInformationActions(actions: PlayerAction[], playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const action of actions) {
			if (action.targetPlayerId === null) continue;

			const actorRole = playerRoles.get(action.playerId);
			const targetRole = playerRoles.get(action.targetPlayerId);
			const targetState = playerStates.get(action.targetPlayerId);
			if (!actorRole || !targetRole || !targetState) continue;

			switch (action.type) {
				case "inspect":
					this.addPersonalResult(personalResults, action.playerId, { type: "inspect", targetPlayerId: action.targetPlayerId, alignment: targetRole.alignment === "commune" ? "good" : "bad" });
					break;
				case "watch":
					this.addPersonalResult(personalResults, action.playerId, { type: "watch", targetPlayerId: action.targetPlayerId, visitorPlayerIds: Array.from(targetState.phase.visitedByPlayerIds) });
					break;
				case "guess":
					this.applyChroniclerGuess(action, playerStates, playerRoles, personalResults);
					break;
			}
		}
	}

	// Checks whether Chronicler guessed the assigned role correctly
	private applyChroniclerGuess(action: PlayerAction, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		if (action.targetPlayerId === null) return;

		const actorState = playerStates.get(action.playerId);
		const targetRole = playerRoles.get(action.targetPlayerId);
		if (!actorState || !targetRole) return;

		const roleKey = actorState.runtime.chroniclerCurrentRoleKey;
		if (roleKey === null) return;

		const correct = targetRole.key === roleKey;

		if (correct) {
			actorState.runtime.chroniclerCorrectGuessCount++;
		}

		actorState.runtime.chroniclerGuessedRoleKeys.add(roleKey);
		actorState.runtime.chroniclerCurrentRoleKey = null;

		this.addPersonalResult(personalResults, action.playerId, { type: "guess", targetPlayerId: action.targetPlayerId, roleKey, correct });
	}

	// Resolves night kills and role-specific kill side effects
	private applyEliminations(actions: PlayerAction[], playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const action of actions) {
			if (action.type !== "eliminate" || action.targetPlayerId === null) continue;

			const actorRole = playerRoles.get(action.playerId);
			const targetRole = playerRoles.get(action.targetPlayerId);
			const actorState = playerStates.get(action.playerId);
			const targetState = playerStates.get(action.targetPlayerId);

			if (!actorRole || !targetRole || !actorState || !targetState) continue;
			if (targetState.runtime.isEliminated) continue;

			if (targetState.phase.isProtected) {
				targetState.phase.wasProtectedFromElimination = true;
				this.addPersonalResult(personalResults, action.playerId, { type: "eliminate", targetPlayerId: action.targetPlayerId });
				continue;
			}

			this.eliminatePlayer(action.targetPlayerId, playerStates, playerRoles, phaseResult);
			this.addPersonalResult(personalResults, action.playerId, { type: "eliminate", targetPlayerId: action.targetPlayerId });

			if (actorRole.key === "vigilante" && targetRole.alignment === "commune") {
				this.eliminatePlayer(action.playerId, playerStates, playerRoles, phaseResult);
			}

			if (actorRole.key === "serialKiller") {
				actorState.runtime.serialKillerEliminationCount++;
			}
		}
	}

	// Resolves Count conversion and notifies both actor and target
	private applyConversions(actions: PlayerAction[], playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const action of actions) {
			if (action.type !== "convert" || action.targetPlayerId === null) continue;

			const actorState = playerStates.get(action.playerId);
			const targetState = playerStates.get(action.targetPlayerId);
			const targetRole = playerRoles.get(action.targetPlayerId);

			if (!actorState || !targetState || !targetRole) continue;
			if (targetState.runtime.isEliminated) continue;

			actorState.runtime.hasUsedConvert = true;
			targetState.runtime.isConverted = true;

			playerRoles.set(action.targetPlayerId, { ...targetRole, key: "vampire", alignment: "vampire" });

			this.addPersonalResult(personalResults, action.playerId, { type: "convert", targetPlayerId: action.targetPlayerId });
			this.addPersonalResult(personalResults, action.targetPlayerId, { type: "converted" });
		}
	}

	// Updates vampire hunger counters based on successful vampire kills
	private applyVampireMissedEliminationCycles(actions: PlayerAction[], playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult): void {
		const successfulVampirePlayerIds = new Set<number>();

		for (const action of actions) {
			if (action.type !== "eliminate" || action.targetPlayerId === null) continue;

			const actorRole = playerRoles.get(action.playerId);
			if (actorRole?.alignment !== "vampire") continue;

			const eliminated = phaseResult.eliminated?.some((entry) => entry.playerId === action.targetPlayerId) ?? false;
			if (!eliminated) continue;

			successfulVampirePlayerIds.add(action.playerId);
		}

		for (const [playerId, role] of playerRoles) {
			if (role.alignment !== "vampire") continue;

			const state = playerStates.get(playerId);
			if (!state || state.runtime.isEliminated) continue;

			state.runtime.vampireMissedEliminationCycles = successfulVampirePlayerIds.has(playerId) ? 0 : state.runtime.vampireMissedEliminationCycles + 1;
		}
	}

	// Kills starving vampires after too many missed kill cycles
	private applyVampireStarvation(playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult): void {
		let missedLimit = 3;

		for (const [playerId, role] of playerRoles) {
			if (role.key !== "bloodBank") continue;
			if (this.isEliminated(playerId, playerStates)) continue;

			missedLimit = 5;
			break;
		}

		for (const [playerId, role] of playerRoles) {
			if (role.alignment !== "vampire") continue;

			const state = playerStates.get(playerId);
			if (!state || state.runtime.isEliminated) continue;

			if (state.runtime.vampireMissedEliminationCycles >= missedLimit) {
				this.eliminatePlayer(playerId, playerStates, playerRoles, phaseResult);
			}
		}
	}

	// Sends Priest feedback about whether protection blocked an attack
	private applyPriestResults(actions: PlayerAction[], playerStates: Map<number, PlayerState>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const action of actions) {
			if (action.type !== "protect" || action.targetPlayerId === null) continue;

			const targetState = playerStates.get(action.targetPlayerId);
			if (!targetState) continue;

			this.addPersonalResult(personalResults, action.playerId, { type: "protect", targetPlayerId: action.targetPlayerId, wasAttacked: targetState.phase.wasProtectedFromElimination });
		}
	}

	// Gives each Chronicler a new unguessed role to identify
	private assignChroniclerRoles(playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, personalResults: Map<number, PersonalPhaseResult[]>): void {
		for (const [playerId, role] of playerRoles) {
			if (role.key !== "chronicler") continue;

			const state = playerStates.get(playerId);
			if (!state || state.runtime.isEliminated) continue;
			if (state.runtime.chroniclerCurrentRoleKey !== null) continue;

			const availableRoleKeys = new Set<string>();

			for (const [targetPlayerId, targetRole] of playerRoles) {
				if (targetPlayerId === playerId) continue;
				if (this.isEliminated(targetPlayerId, playerStates)) continue;
				if (state.runtime.chroniclerGuessedRoleKeys.has(targetRole.key)) continue;

				availableRoleKeys.add(targetRole.key);
			}

			const roleKeys = Array.from(availableRoleKeys);
			if (roleKeys.length === 0) continue;

			const roleKey = roleKeys[Math.floor(Math.random() * roleKeys.length)];
			state.runtime.chroniclerCurrentRoleKey = roleKey;

			this.addPersonalResult(personalResults, playerId, { type: "chronicler_to_guess", roleKey });
		}
	}

	// Checks whether any faction or neutral role has won
	private resolveWinner(phase: PhaseType, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult): FinishedGameWinner | null {
		const jesterWinner = this.resolveJesterWinner(phase, playerRoles, phaseResult);
		if (jesterWinner) return jesterWinner;

		const neutralWinner = this.resolveNeutralWinner(playerStates, playerRoles);
		if (neutralWinner) return neutralWinner;

		const livingVampires: number[] = [];
		const livingNonVampires: number[] = [];
		const allVampires: number[] = [];
		const allCommune: number[] = [];

		for (const [playerId, state] of playerStates) {
			const role = playerRoles.get(playerId);

			if (role?.alignment === "vampire") {
				allVampires.push(playerId);
			} else if (role?.alignment === "commune") {
				allCommune.push(playerId);
			}

			if (state.runtime.isEliminated) continue;

			if (role?.alignment === "vampire") {
				livingVampires.push(playerId);
			} else {
				livingNonVampires.push(playerId);
			}
		}

		if (livingVampires.length === 0) {
			return { faction: "commune", playerIds: allCommune };
		}

		if (livingVampires.length >= livingNonVampires.length) {
			return { faction: "vampire", playerIds: allVampires };
		}

		return null;
	}

	// Jester wins only when eliminated by vote
	private resolveJesterWinner(phase: PhaseType, playerRoles: Map<number, Role>, phaseResult: PhaseResult): FinishedGameWinner | null {
		if (phase !== "voting") return null;

		for (const eliminated of phaseResult.eliminated ?? []) {
			const role = playerRoles.get(eliminated.playerId);
			if (role?.key !== "jester") continue;

			return { faction: "neutral", playerIds: [eliminated.playerId] };
		}

		return null;
	}

	// Checks Serial Killer and Chronicler personal win conditions
	private resolveNeutralWinner(playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>): FinishedGameWinner | null {
		const serialKillerRequiredKills = Math.ceil(playerStates.size / 2);
		const chroniclerRequiredGuesses = Math.ceil(playerStates.size / 4);

		for (const [playerId, state] of playerStates) {
			if (state.runtime.isEliminated) continue;

			const role = playerRoles.get(playerId);
			if (!role) continue;

			if (role.key === "serialKiller" && state.runtime.serialKillerEliminationCount >= serialKillerRequiredKills) {
				return { faction: "neutral", playerIds: [playerId] };
			}

			if (role.key === "chronicler" && state.runtime.chroniclerCorrectGuessCount >= chroniclerRequiredGuesses) {
				return { faction: "neutral", playerIds: [playerId] };
			}
		}

		return null;
	}

	// Marks a player dead and appends public elimination data
	private eliminatePlayer(playerId: number, playerStates: Map<number, PlayerState>, playerRoles: Map<number, Role>, phaseResult: PhaseResult): void {
		const state = playerStates.get(playerId);
		if (!state || state.runtime.isEliminated) return;

		state.runtime.isEliminated = true;

		const role = playerRoles.get(playerId);
		const eliminated = phaseResult.eliminated ?? [];

		eliminated.push({ playerId, roleKey: role?.key });
		phaseResult.eliminated = eliminated;
	}

	// Looks if eliminated, missing for safety is eliminated
	private isEliminated(playerId: number, playerStates: Map<number, PlayerState>): boolean {
		return playerStates.get(playerId)?.runtime.isEliminated ?? true;
	}

	// Adds one private result message for a specific player
	private addPersonalResult(personalResults: Map<number, PersonalPhaseResult[]>, playerId: number, result: PersonalPhaseResult): void {
		const results = personalResults.get(playerId) ?? [];
		results.push(result);
		personalResults.set(playerId, results);
	}
}

export default new GamePhaseService();
