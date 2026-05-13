import { beforeEach, describe, expect, it, vi } from "vitest";
import gameService from "../../../src/services/gameService";
import { ErrorCode } from "../../../src/types";
import { makeGame, makeParticipant, makeRole } from "./factories";

const gameTx = {
	lockGameForMutation: vi.fn(),
	changeStatus: vi.fn(),
	completeGame: vi.fn()
};
const participantTx = {
	findByGameId: vi.fn(),
	findByGameIdAndPlayerId: vi.fn(),
	patch: vi.fn(),
	delete: vi.fn(),
	setWinnersByGameId: vi.fn()
};
const actionTx = {
	create: vi.fn()
};

vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

vi.mock("../../../src/repositories/gameRepository", () => ({
	GameModel: {
		create: vi.fn(),
		findByGameId: vi.fn(),
		findByGameCode: vi.fn(),
		findActiveGameByPlayerId: vi.fn(),
		findSessionSnapshot: vi.fn(),
		cancelAllNonFinishedGames: vi.fn(),
		changeStatus: vi.fn()
	},
	GameModelTransaction: vi.fn(() => gameTx)
}));

vi.mock("../../../src/repositories/participantRepository", () => ({
	ParticipantModel: {
		findByGameIdAndPlayerId: vi.fn(),
		findByGameId: vi.fn(),
		setDeadByGameId: vi.fn()
	},
	ParticipantModelTransaction: vi.fn(() => participantTx)
}));

vi.mock("../../../src/repositories/actionRepository", () => ({
	ActionModelTransaction: vi.fn(() => actionTx)
}));

vi.mock("../../../src/repositories/playerRepository", () => ({
	PlayerModel: {
		findByBotId: vi.fn()
	}
}));

vi.mock("../../../src/repositories/botRepository", () => ({
	BotModel: {
		getAvailableBots: vi.fn()
	}
}));

vi.mock("../../../src/services/gameLobbyService", () => ({
	default: {
		claimSeat: vi.fn()
	}
}));

import { BotModel } from "../../../src/repositories/botRepository";
import { GameModel } from "../../../src/repositories/gameRepository";
import { ParticipantModel } from "../../../src/repositories/participantRepository";
import { PlayerModel } from "../../../src/repositories/playerRepository";
import gameLobbyService from "../../../src/services/gameLobbyService";

describe("gameService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gameTx.lockGameForMutation.mockResolvedValue(makeGame());
		participantTx.findByGameId.mockResolvedValue([
			makeParticipant({ playerId: 1, seatNr: 1 }),
			makeParticipant({ playerId: 2, seatNr: 2 }),
			makeParticipant({ playerId: 3, seatNr: 3 }),
			makeParticipant({ playerId: 4, seatNr: 4 }),
			makeParticipant({ playerId: 5, seatNr: 5 })
		]);
		participantTx.findByGameIdAndPlayerId.mockImplementation((gameId, playerId) => Promise.resolve(makeParticipant({ gameId, playerId, roleId: 1 })));
	});

	it("Pakartoja žaidimo kodo generavimą po sutapimų ir sukuria žaidimą", async () => {
		vi.mocked(GameModel.create)
			.mockRejectedValueOnce({ code: "P2002" })
			.mockResolvedValueOnce(makeGame({ id: 10, gameCode: "ZZZZZZ" }));

		await expect(gameService.createGame()).resolves.toMatchObject({ id: 10, gameCode: "ZZZZZZ" });
		expect(GameModel.create).toHaveBeenCalledTimes(2);
	});

	it("Nepavykus išvengti pasikartojančių kodo sutapimų nesukuria žaidimo", async () => {
		vi.mocked(GameModel.create).mockRejectedValue({ code: "P2002" });

		await expect(gameService.createGame()).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_CREATED });
	});

	it("Leidžia prisijungti tik prie laukiamojo kambario žaidimų ir perduoda vietos užėmimą", async () => {
		vi.mocked(GameModel.findByGameId).mockResolvedValue(makeGame());
		vi.mocked(ParticipantModel.findByGameIdAndPlayerId).mockResolvedValue(null);
		vi.mocked(gameLobbyService.claimSeat).mockResolvedValue(makeParticipant({ playerId: 10, seatNr: 2 }));

		await expect(gameService.joinGame(10, 1)).resolves.toMatchObject({ playerId: 10, seatNr: 2 });

		vi.mocked(GameModel.findByGameId).mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(gameService.joinGame(10, 1)).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });
	});

	it("Prideda botą tik tada, kai lyderis yra pirmoje vietoje ir yra laisvas boto žaidėjas", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.mocked(GameModel.findByGameId).mockResolvedValue(makeGame());
		vi.mocked(ParticipantModel.findByGameIdAndPlayerId).mockResolvedValue(makeParticipant({ playerId: 10, seatNr: 1 }));
		vi.mocked(ParticipantModel.findByGameId).mockResolvedValue([makeParticipant({ playerId: 10, seatNr: 1 })]);
		vi.mocked(BotModel.getAvailableBots).mockResolvedValue([{ id: 50, name: "Bot" }]);
		vi.mocked(PlayerModel.findByBotId).mockResolvedValue({ id: 99, type: "bot", icon: null, iconEtag: "etag", createdAt: new Date(), updatedAt: new Date() });
		vi.mocked(gameLobbyService.claimSeat).mockResolvedValue(makeParticipant({ playerId: 99, seatNr: 2 }));

		await expect(gameService.addBot(10, 1)).resolves.toMatchObject({ playerId: 99, seatNr: 2 });
		expect(BotModel.getAvailableBots).toHaveBeenCalledWith([10]);
	});

	it("Pradeda žaidimą priskirdamas tikslias roles transakcijoje gautiems dalyviams", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		await expect(gameService.startGame(1, 5, { 1: 3, 2: 2 }, "exact", [
			makeRole({ id: 1, key: "commoner", alignment: "commune" }),
			makeRole({ id: 2, key: "vampire", alignment: "vampire" })
		])).resolves.toHaveLength(5);

		expect(participantTx.patch).toHaveBeenCalledTimes(5);
		expect(participantTx.patch.mock.calls.map((call) => call[0].roleId).sort()).toEqual([1, 1, 1, 2, 2]);
		expect(gameTx.changeStatus).toHaveBeenCalledWith(1, "in_progress");
		expect(ParticipantModel.findByGameIdAndPlayerId).not.toHaveBeenCalled();
	});

	it("Pradeda svertinį atsitiktinį žaidimą su subalansuotomis bendruomenės ir vampyrų rolėmis", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		await expect(gameService.startGame(1, 5, { 1: 1, 2: 1, 3: 1 }, "weighted_random", [
			makeRole({ id: 1, key: "commoner", alignment: "commune", weight: 1 }),
			makeRole({ id: 2, key: "vampire", alignment: "vampire", weight: 3 }),
			makeRole({ id: 3, key: "jester", alignment: "neutral", weight: 1 })
		])).resolves.toHaveLength(5);

		const assignedRoles = participantTx.patch.mock.calls.map((call) => call[0].roleId);
		expect(assignedRoles.filter((roleId) => roleId === 1)).toHaveLength(4);
		expect(assignedRoles.filter((roleId) => roleId === 2)).toHaveLength(1);
	});

	it("Atmeta žaidimo pradžią, kai žaidimo nėra, jis aktyvus, trūksta dalyvių arba netinkamas rolių kiekis", async () => {
		gameTx.lockGameForMutation.mockResolvedValueOnce(null);
		await expect(gameService.startGame(1, 5, {}, "exact", [])).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND });

		gameTx.lockGameForMutation.mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(gameService.startGame(1, 5, {}, "exact", [])).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });

		participantTx.findByGameId.mockResolvedValueOnce([makeParticipant({ playerId: 1 })]);
		await expect(gameService.startGame(1, 5, {}, "exact", [])).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_ERROR });

		await expect(gameService.startGame(1, 5, { 1: 1 }, "exact", [makeRole({ id: 1 })])).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_ERROR });
	});

	it("Išsaugo fazės veiksmus pagal dalyvių id ir praleidžia trūkstamus veikėjus ar taikinius", async () => {
		participantTx.findByGameIdAndPlayerId.mockImplementation((gameId, playerId) => {
			if (playerId === 2) return Promise.resolve(null);
			if (playerId === 99) return Promise.resolve(null);
			return Promise.resolve(makeParticipant({ gameId, playerId }));
		});

		await gameService.savePhaseActions(1, "voting", 2, new Map([
			[1, { playerId: 1, type: "vote", targetPlayerId: 99 }],
			[2, { playerId: 2, type: "skip", targetPlayerId: null }],
			[3, { playerId: 3, type: "vote", targetPlayerId: 1 }]
		]));

		expect(actionTx.create).toHaveBeenCalledTimes(2);
		expect(actionTx.create).toHaveBeenCalledWith({ gameId: 1, actorParticipantId: 1, targetParticipantId: null, actionKey: "vote", dayNumber: 2, phase: "voting" });
		expect(actionTx.create).toHaveBeenCalledWith({ gameId: 1, actorParticipantId: 3, targetParticipantId: 1, actionKey: "vote", dayNumber: 2, phase: "voting" });
	});

	it("Per repozitorijas apdoroja išėjimą, išmetimą, žaidimo užbaigimą ir žaidėjų mirtį", async () => {
		await gameService.leaveGame(10, 1);
		expect(participantTx.delete).toHaveBeenCalledWith(1, 10);

		participantTx.findByGameIdAndPlayerId
			.mockResolvedValueOnce(makeParticipant({ playerId: 10, seatNr: 1 }))
			.mockResolvedValueOnce(makeParticipant({ playerId: 20, seatNr: 2 }));
		await gameService.kickPlayer(10, 20, 1);
		expect(participantTx.delete).toHaveBeenCalledWith(1, 20);

		await gameService.completeGame(1, "commune", [10, 20]);
		expect(gameTx.completeGame).toHaveBeenCalledWith(1, "commune");
		expect(participantTx.setWinnersByGameId).toHaveBeenCalledWith(1, [10, 20]);

		await gameService.setDead(1, [20]);
		expect(ParticipantModel.setDeadByGameId).toHaveBeenCalledWith(1, [20]);
	});

	it("Filtruoja sesijų kopijas pagal būseną ir perduoda paprastas repozitorijų operacijas", async () => {
		const lobbySnapshot = { game: makeGame({ status: "lobby" }), participants: [], roleSettings: {}, botSettings: {} };
		const activeSnapshot = { game: makeGame({ status: "in_progress" }), participants: [], roleSettings: {}, botSettings: {} };

		vi.mocked(GameModel.findSessionSnapshot).mockResolvedValueOnce(lobbySnapshot).mockResolvedValueOnce(activeSnapshot).mockResolvedValueOnce(lobbySnapshot);

		await expect(gameService.getLobbyGameSnapshot(1)).resolves.toBe(lobbySnapshot);
		await expect(gameService.getInProgressGameSnapshot(1)).resolves.toBe(activeSnapshot);
		await expect(gameService.getInProgressGameSnapshot(1)).resolves.toBeNull();

		vi.mocked(GameModel.cancelAllNonFinishedGames).mockResolvedValue(3);
		await expect(gameService.cancelAllNonFinishedGames()).resolves.toBe(3);
		await gameService.cancelGame(1);
		expect(GameModel.changeStatus).toHaveBeenCalledWith(1, "cancelled");
	});
});
