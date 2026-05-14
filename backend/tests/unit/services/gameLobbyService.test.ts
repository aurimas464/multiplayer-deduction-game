import { beforeEach, describe, expect, it, vi } from "vitest";
import gameLobbyService from "../../../src/services/gameLobbyService";
import { ErrorCode } from "../../../src/types";
import { makeGame, makeParticipant } from "./factories";

const gameTx = {
	lockGameForMutation: vi.fn(),
	findByGameId: vi.fn(),
	patch: vi.fn()
};
const participantTx = {
	findByGameIdAndPlayerId: vi.fn(),
	findByGameId: vi.fn(),
	countByGameId: vi.fn(),
	findOccupiedSeats: vi.fn(),
	create: vi.fn(),
	patch: vi.fn()
};
const botSetupTx = {
	upsert: vi.fn(),
	patch: vi.fn()
};

// Mock database
vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

// Mock repositories
vi.mock("../../../src/repositories/gameRepository", () => ({
	GameModelTransaction: vi.fn(() => gameTx)
}));

vi.mock("../../../src/repositories/participantRepository", () => ({
	ParticipantModelTransaction: vi.fn(() => participantTx)
}));

vi.mock("../../../src/repositories/gameBotSetupRepository", () => ({
	GameBotSetupModelTransaction: vi.fn(() => botSetupTx)
}));

describe("gameLobbyService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gameTx.lockGameForMutation.mockResolvedValue(makeGame());
		gameTx.findByGameId.mockResolvedValue(makeGame());
		participantTx.findByGameIdAndPlayerId.mockResolvedValue(null);
		participantTx.findByGameId.mockResolvedValue([makeParticipant({ playerId: 10, seatNr: 1 })]);
		participantTx.countByGameId.mockResolvedValue(1);
		participantTx.findOccupiedSeats.mockResolvedValue([1]);
		participantTx.create.mockImplementation((data) => Promise.resolve(makeParticipant(data)));
	});

	it("Užima pirmą laisvą vietą ir pakartotinai grąžina jau turimą vietą", async () => {
		await expect(gameLobbyService.claimSeat(1, 20)).resolves.toMatchObject({ gameId: 1, playerId: 20, seatNr: 2 });

		participantTx.findByGameIdAndPlayerId.mockResolvedValueOnce(makeParticipant({ playerId: 20, seatNr: 2 }));
		await expect(gameLobbyService.claimSeat(1, 20)).resolves.toMatchObject({ playerId: 20, seatNr: 2 });
		expect(participantTx.create).toHaveBeenCalledTimes(1);
	});

	it("Po vietos unikalumo sutapimo tęsia vykdymą ir užima kitą laisvą vietą", async () => {
		participantTx.create
			.mockRejectedValueOnce({ code: "P2002" })
			.mockImplementationOnce((data) => Promise.resolve(makeParticipant(data)));

		await expect(gameLobbyService.claimSeat(1, 20)).resolves.toMatchObject({ seatNr: 3 });
	});

	it("Grąžina pilno kambario klaidą, kai visos laisvos vietos pralaimi unikalumo sutapimams", async () => {
		gameTx.lockGameForMutation.mockResolvedValue(makeGame({ maxPlayers: 3 }));
		participantTx.findOccupiedSeats.mockResolvedValue([1]);
		participantTx.create.mockRejectedValue({ code: "P2002" });

		await expect(gameLobbyService.claimSeat(1, 20)).rejects.toMatchObject({ code: ErrorCode.GAME_FULL });
	});

	it("Vietos užėmimo metu nepaslepia netikėtų repozitorijos klaidų", async () => {
		const failure = new Error("database unavailable");
		participantTx.create.mockRejectedValueOnce(failure);

		await expect(gameLobbyService.claimSeat(1, 20)).rejects.toBe(failure);
	});

	it("Atmeta netinkamus laukiamojo kambario vietų pakeitimus", async () => {
		gameTx.lockGameForMutation.mockResolvedValueOnce(null);
		await expect(gameLobbyService.claimSeat(1, 20)).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND });

		gameTx.lockGameForMutation.mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(gameLobbyService.claimSeat(1, 20)).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });

		gameTx.lockGameForMutation.mockResolvedValueOnce(makeGame({ maxPlayers: 1 }));
		participantTx.countByGameId.mockResolvedValueOnce(1);
		await expect(gameLobbyService.claimSeat(1, 20)).rejects.toMatchObject({ code: ErrorCode.GAME_FULL });
	});

	it("Pakeičia vietą, kai užklausos siuntėjas yra laukiamajame kambaryje ir norima vieta laisva", async () => {
		participantTx.findByGameId.mockResolvedValue([
			makeParticipant({ playerId: 20, seatNr: 2 }),
			makeParticipant({ playerId: 30, seatNr: 3 })
		]);

		await gameLobbyService.changeSeat(20, 1, 4);

		expect(participantTx.patch).toHaveBeenCalledWith({ gameId: 1, playerId: 20, seatNr: 4 });
	});

	it("Nekeičia vietos, kai pasirinkta ta pati laukiamojo kambario vieta", async () => {
		participantTx.findByGameId.mockResolvedValue([makeParticipant({ playerId: 20, seatNr: 2 })]);

		await gameLobbyService.changeSeat(20, 1, 2);

		expect(participantTx.patch).not.toHaveBeenCalled();
	});

	it("Patikrina vietos pakeitimus ir pasikartojimo sutapimus paverčia užimtos vietos klaidomis", async () => {
		participantTx.findByGameId.mockResolvedValue([
			makeParticipant({ playerId: 20, seatNr: 2 }),
			makeParticipant({ playerId: 30, seatNr: 3 })
		]);

		await expect(gameLobbyService.changeSeat(20, 1, 9)).rejects.toMatchObject({ code: ErrorCode.INVALID_SEAT });
		await expect(gameLobbyService.changeSeat(20, 1, 3)).rejects.toMatchObject({ code: ErrorCode.SEAT_TAKEN });

		participantTx.findByGameId.mockResolvedValueOnce([makeParticipant({ playerId: 20, seatNr: 2 })]);
		participantTx.patch.mockRejectedValueOnce({ code: "P2002" });
		await expect(gameLobbyService.changeSeat(20, 1, 4)).rejects.toMatchObject({ code: ErrorCode.SEAT_TAKEN });
	});

	it("Atmeta vietos pakeitimą, kai žaidimo nėra, jis aktyvus arba žaidėjas nėra kambaryje", async () => {
		gameTx.lockGameForMutation.mockResolvedValueOnce(null);
		await expect(gameLobbyService.changeSeat(20, 1, 2)).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND });

		gameTx.lockGameForMutation.mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(gameLobbyService.changeSeat(20, 1, 2)).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });

		participantTx.findByGameId.mockResolvedValueOnce([makeParticipant({ playerId: 30, seatNr: 1 })]);
		await expect(gameLobbyService.changeSeat(20, 1, 2)).rejects.toMatchObject({ code: ErrorCode.PLAYER_NOT_IN_LOBBY });
	});

	it("Laukiamojo kambario nustatymus atnaujina tik lyderiui ir patikrina ribas", async () => {
		await gameLobbyService.updateLobbySettings(10, 1, { maxPlayers: 6, minPlayers: 5, daySeconds: 20 });

		expect(gameTx.patch).toHaveBeenCalledWith({ id: 1, maxPlayers: 6, minPlayers: 5, daySeconds: 20 });

		participantTx.findByGameId.mockResolvedValueOnce([makeParticipant({ playerId: 10, seatNr: 2 })]);
		await expect(gameLobbyService.updateLobbySettings(10, 1, { maxPlayers: 6 })).rejects.toMatchObject({ code: ErrorCode.NOT_GAME_LEADER });

		await expect(gameLobbyService.updateLobbySettings(10, 1, { minPlayers: 4 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
	});

	it("Atmeta netinkamas laukiamojo kambario trukmes ir dydžius", async () => {
		await expect(gameLobbyService.updateLobbySettings(10, 1, { maxPlayers: 21 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		await expect(gameLobbyService.updateLobbySettings(10, 1, { minPlayers: 9 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		await expect(gameLobbyService.updateLobbySettings(10, 1, { daySeconds: 9 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		await expect(gameLobbyService.updateLobbySettings(10, 1, { votingSeconds: 1000 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		await expect(gameLobbyService.updateLobbySettings(10, 1, { nightSeconds: 1000 })).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
	});

	it("Neleidžia sumažinti vietų skaičiaus žemiau užimtų vietų kiekio", async () => {
		participantTx.findOccupiedSeats.mockResolvedValueOnce([1, 7]);

		await expect(gameLobbyService.updateLobbySettings(10, 1, { maxPlayers: 6 })).rejects.toMatchObject({ code: ErrorCode.LOBBY_TOO_SMALL });
	});

	it("Boto nustatymus atnaujina tik kai užklausos siuntėjas yra lyderis, o botas yra kambaryje", async () => {
		participantTx.findByGameIdAndPlayerId
			.mockResolvedValueOnce(makeParticipant({ playerId: 10, seatNr: 1 }))
			.mockResolvedValueOnce(makeParticipant({ playerId: 99, seatNr: 2 }));

		await gameLobbyService.updateBotSettings(10, 1, 99, "hard", "aggressive");

		expect(botSetupTx.upsert).toHaveBeenCalledWith({ gameId: 1, playerId: 99 });
		expect(botSetupTx.patch).toHaveBeenCalledWith({ gameId: 1, playerId: 99, difficulty: "hard", playstyle: "aggressive" });
	});

	it("Atmeta boto nustatymų keitimą, kai žaidimas arba botas netinkami", async () => {
		gameTx.lockGameForMutation.mockResolvedValueOnce(null);
		await expect(gameLobbyService.updateBotSettings(10, 1, 99, "hard", "aggressive")).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND });

		gameTx.lockGameForMutation.mockResolvedValueOnce(makeGame({ status: "in_progress" }));
		await expect(gameLobbyService.updateBotSettings(10, 1, 99, "hard", "aggressive")).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_IN_LOBBY });

		participantTx.findByGameIdAndPlayerId.mockResolvedValueOnce(makeParticipant({ playerId: 10, seatNr: 2 }));
		await expect(gameLobbyService.updateBotSettings(10, 1, 99, "hard", "aggressive")).rejects.toMatchObject({ code: ErrorCode.NOT_GAME_LEADER });

		participantTx.findByGameIdAndPlayerId
			.mockResolvedValueOnce(makeParticipant({ playerId: 10, seatNr: 1 }))
			.mockResolvedValueOnce(null);
		await expect(gameLobbyService.updateBotSettings(10, 1, 99, "hard", "aggressive")).rejects.toMatchObject({ code: ErrorCode.PLAYER_NOT_IN_LOBBY });
	});
});
