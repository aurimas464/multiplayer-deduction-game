import { beforeEach, describe, expect, it, vi } from "vitest";
import chatService from "../../../src/services/chatService";
import type { DirectChat } from "../../../src/types/entities/directChat";
import type { Friendship } from "../../../src/types/entities/friendship";
import { ErrorCode } from "../../../src/types";
import { makeGameMessage, makeParticipant, makeUserWithPlayer, now } from "./factories";

const friendshipTx = {
	findByUsers: vi.fn(),
	findById: vi.fn()
};
const directChatTx = {
	findByFriendshipId: vi.fn(),
	create: vi.fn(),
	findById: vi.fn()
};
const messageTx = {
	findByChatId: vi.fn(),
	countByChatId: vi.fn(),
	create: vi.fn(),
	findById: vi.fn(),
	editMessage: vi.fn(),
	markDeleted: vi.fn()
};
const userTx = {
	findById: vi.fn()
};

// Test data
const friendship = (overrides: Partial<Friendship> = {}): Friendship => ({
	id: 5,
	userId1: 1,
	userId2: 2,
	status: "accepted",
	requestedBy: 1,
	blockedBy: null,
	createdAt: now,
	updatedAt: now,
	...overrides
});

const directChat = (overrides: Partial<DirectChat> = {}): DirectChat => ({
	id: 6,
	friendshipId: 5,
	lastMessageId: null,
	lastMessageRead: true,
	createdAt: now,
	updatedAt: now,
	...overrides
});

// Mock database
vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

// Mock repositories
vi.mock("../../../src/repositories/directChatRepository", () => ({
	DirectChatModel: {
		findByUserIdWithDetails: vi.fn(),
		countByUserId: vi.fn(),
		hasUnreadByUserId: vi.fn(),
		findByFriendshipId: vi.fn(),
		markReadByFriendshipId: vi.fn()
	},
	DirectChatModelTransaction: vi.fn(() => directChatTx)
}));

vi.mock("../../../src/repositories/directChatMessageRepository", () => ({
	DirectChatMessageModelTransaction: vi.fn(() => messageTx)
}));

vi.mock("../../../src/repositories/friendshipRepository", () => ({
	FriendshipModel: {
		findByUsers: vi.fn()
	},
	FriendshipModelTransaction: vi.fn(() => friendshipTx)
}));

vi.mock("../../../src/repositories/gameRepository", () => ({
	GameModel: {
		findGamesByUserIdWithDetails: vi.fn(),
		countGamesByUserId: vi.fn()
	}
}));

vi.mock("../../../src/repositories/gameChatMessageRepository", () => ({
	GameChatMessageModel: {
		findByGameId: vi.fn(),
		countByGameId: vi.fn(),
		create: vi.fn()
	}
}));

vi.mock("../../../src/repositories/participantRepository", () => ({
	ParticipantModel: {
		findByGameIdAndPlayerId: vi.fn()
	}
}));

vi.mock("../../../src/repositories/userRepository", () => ({
	UserModel: {
		findById: vi.fn()
	},
	UserModelTransaction: vi.fn(() => userTx)
}));

import { DirectChatModel } from "../../../src/repositories/directChatRepository";
import { FriendshipModel } from "../../../src/repositories/friendshipRepository";
import { GameChatMessageModel } from "../../../src/repositories/gameChatMessageRepository";
import { ParticipantModel } from "../../../src/repositories/participantRepository";
import { UserModel } from "../../../src/repositories/userRepository";

describe("chatService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		friendshipTx.findByUsers.mockResolvedValue(friendship());
		directChatTx.findByFriendshipId.mockResolvedValue(directChat());
		messageTx.findByChatId.mockResolvedValue([]);
		messageTx.countByChatId.mockResolvedValue(0);
		userTx.findById.mockResolvedValue(makeUserWithPlayer({ id: 1, player: { id: 10, iconEtag: "etag" } }));
	});

	it("Puslapiais grąžina asmeninių ir žaidimo pokalbių sąrašus", async () => {
		vi.mocked(DirectChatModel.findByUserIdWithDetails).mockResolvedValue([{ id: 1 } as never]);
		vi.mocked(DirectChatModel.countByUserId).mockResolvedValue(1);

		await expect(chatService.getDirectChats(1, { offset: 0, limit: 10 })).resolves.toEqual({ data: [{ id: 1 }], total: 1, offset: 0, limit: 10 });
	});

	it("Asmeninius pokalbius pažymi perskaitytais tik esant patvirtintai draugystei", async () => {
		vi.mocked(FriendshipModel.findByUsers).mockResolvedValue(friendship());
		vi.mocked(DirectChatModel.findByFriendshipId).mockResolvedValue(directChat());

		await chatService.markDirectChatRead(1, 2);
		expect(DirectChatModel.markReadByFriendshipId).toHaveBeenCalledWith(5);

		vi.mocked(FriendshipModel.findByUsers).mockResolvedValueOnce(friendship({ status: "pending" }));
		await expect(chatService.markDirectChatRead(1, 2)).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FRIEND });
	});

	it("Praleidžia perskaitymo žymėjimą, kai asmeninis pokalbis dar nesukurtas", async () => {
		vi.mocked(FriendshipModel.findByUsers).mockResolvedValue(friendship());
		vi.mocked(DirectChatModel.findByFriendshipId).mockResolvedValue(null);

		await chatService.markDirectChatRead(1, 2);

		expect(DirectChatModel.markReadByFriendshipId).not.toHaveBeenCalled();
	});

	it("Sukuria trūkstamus asmeninius pokalbius ir grąžina žinutes", async () => {
		directChatTx.findByFriendshipId.mockResolvedValueOnce(null);
		directChatTx.create.mockResolvedValueOnce(directChat({ id: 7 }));
		messageTx.findByChatId.mockResolvedValueOnce([{ id: 1, chatId: 7, senderId: 1, message: "hi", editedAt: null, deletedAt: null, createdAt: now, updatedAt: now }]);
		messageTx.countByChatId.mockResolvedValueOnce(1);

		await expect(chatService.getDirectChatMessages(1, 2, { offset: 0, limit: 20 })).resolves.toMatchObject({ total: 1, data: [{ chatId: 7 }] });
	});

	it("Siunčia asmenines žinutes ir nustato gavėją", async () => {
		messageTx.create.mockResolvedValue({ id: 3, chatId: 6, senderId: 1, message: "hello", editedAt: null, deletedAt: null, createdAt: now, updatedAt: now });

		await expect(chatService.sendDirectMessage(1, 2, "hello")).resolves.toMatchObject({
			recipientId: 2,
			data: { id: 3, chatId: 6, senderId: 1, message: "hello", user: { id: 1, username: "Aurimas" } }
		});
	});

	it("Blokuoja asmeninių žinučių veiksmus netinkamam siuntėjui arba ištrintoms žinutėms", async () => {
		messageTx.findById.mockResolvedValueOnce({ id: 3, chatId: 6, senderId: 2, message: "hello", editedAt: null, deletedAt: null, createdAt: now, updatedAt: now });
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });

		messageTx.findById.mockResolvedValueOnce({ id: 3, chatId: 6, senderId: 1, message: "hello", editedAt: null, deletedAt: now, createdAt: now, updatedAt: now });
		await expect(chatService.deleteDirectMessage(1, 3)).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
	});

	it("Atmeta asmeninių žinučių redagavimą, kai trūksta įrašo, pokalbio, draugystės arba siuntėjo", async () => {
		const original = { id: 3, chatId: 6, senderId: 1, message: "hello", editedAt: null, deletedAt: null, createdAt: now, updatedAt: now };

		messageTx.findById.mockResolvedValueOnce(null);
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.FRIENDSHIP_NOT_FOUND });

		messageTx.findById.mockResolvedValueOnce(original);
		directChatTx.findById.mockResolvedValueOnce(null);
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.FRIENDSHIP_NOT_FOUND });

		messageTx.findById.mockResolvedValueOnce(original);
		directChatTx.findById.mockResolvedValueOnce(directChat());
		friendshipTx.findById.mockResolvedValueOnce(friendship({ status: "pending" }));
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FRIEND });

		messageTx.findById.mockResolvedValueOnce(original).mockResolvedValueOnce(null);
		directChatTx.findById.mockResolvedValueOnce(directChat());
		friendshipTx.findById.mockResolvedValueOnce(friendship());
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR });

		messageTx.findById.mockResolvedValueOnce(original).mockResolvedValueOnce({ ...original, message: "edit" });
		directChatTx.findById.mockResolvedValueOnce(directChat());
		friendshipTx.findById.mockResolvedValueOnce(friendship());
		userTx.findById.mockResolvedValueOnce(null);
		await expect(chatService.editDirectMessage(1, 3, "edit")).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });
	});

	it("Redaguoja ir ištrina savo asmenines žinutes, kai draugystė vis dar patvirtinta", async () => {
		const original = { id: 3, chatId: 6, senderId: 1, message: "hello", editedAt: null, deletedAt: null, createdAt: now, updatedAt: now };
		const updated = { ...original, message: "edited", editedAt: now };
		messageTx.findById.mockResolvedValueOnce(original).mockResolvedValueOnce(updated);
		directChatTx.findById.mockResolvedValue(directChat());
		friendshipTx.findById.mockResolvedValue(friendship());

		await expect(chatService.editDirectMessage(1, 3, "edited")).resolves.toMatchObject({
			recipientId: 2,
			data: { id: 3, message: "edited", user: { id: 1 } }
		});
		expect(messageTx.editMessage).toHaveBeenCalledWith(3, "edited");

		messageTx.findById.mockResolvedValueOnce(original);
		await expect(chatService.deleteDirectMessage(1, 3)).resolves.toEqual({ recipientId: 2 });
		expect(messageTx.markDeleted).toHaveBeenCalledWith(3);
	});

	it("Atsistato po asmeninio pokalbio kūrimo sutapimų, sukeltų unikalumo apribojimų", async () => {
		friendshipTx.findByUsers.mockResolvedValue(friendship());
		directChatTx.findByFriendshipId
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(directChat());
		directChatTx.create.mockRejectedValueOnce({ code: "P2002" });
		messageTx.findByChatId.mockResolvedValueOnce([]);
		messageTx.countByChatId.mockResolvedValueOnce(0);

		await expect(chatService.getDirectChatMessages(1, 2, { offset: 0, limit: 10 })).resolves.toEqual({ data: [], total: 0, offset: 0, limit: 10 });
	});

	it("Žaidimo žinutes grąžina tik tada, kai naudotojas dalyvauja žaidime", async () => {
		vi.mocked(UserModel.findById).mockResolvedValue(makeUserWithPlayer({ player: { id: 10, iconEtag: "etag" } }));
		vi.mocked(ParticipantModel.findByGameIdAndPlayerId).mockResolvedValue(makeParticipant({ playerId: 10 }));
		vi.mocked(GameChatMessageModel.findByGameId).mockResolvedValue([makeGameMessage()]);
		vi.mocked(GameChatMessageModel.countByGameId).mockResolvedValue(1);

		await expect(chatService.getGameChatMessages(1, 1, { offset: 0, limit: 10 })).resolves.toMatchObject({ total: 1, data: [{ message: "hello" }] });

		vi.mocked(UserModel.findById).mockResolvedValueOnce(null);
		await expect(chatService.getGameChatMessages(1, 1, { offset: 0, limit: 10 })).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });

		vi.mocked(UserModel.findById).mockResolvedValueOnce(makeUserWithPlayer({ player: { id: 10, iconEtag: "etag" } }));
		vi.mocked(ParticipantModel.findByGameIdAndPlayerId).mockResolvedValueOnce(null);
		await expect(chatService.getGameChatMessages(1, 1, { offset: 0, limit: 10 })).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
	});

	it("Žaidimo žinutes išsiunčia įrašydamas ir perskaitydamas naujausią įrašą", async () => {
		vi.mocked(GameChatMessageModel.findByGameId).mockResolvedValue([makeGameMessage({ id: 9, message: "hey" })]);

		await expect(chatService.sendGameMessage({ gameId: 1, playerId: 1, message: "hey", messageType: "player", dayNumber: 1, phase: "day" })).resolves.toMatchObject({ id: 9, message: "hey" });
		expect(GameChatMessageModel.create).toHaveBeenCalledWith({ gameId: 1, playerId: 1, message: "hey", messageType: "player", dayNumber: 1, phase: "day" });
	});
});
