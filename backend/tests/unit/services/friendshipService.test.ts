import { beforeEach, describe, expect, it, vi } from "vitest";
import friendshipService from "../../../src/services/friendshipService";
import type { Friendship } from "../../../src/types/entities/friendship";
import { ErrorCode } from "../../../src/types";
import { makeUserWithPlayer, now } from "./factories";

const userTx = {
	findByUsername: vi.fn(),
	findById: vi.fn()
};
const friendshipTx = {
	findByUsers: vi.fn(),
	countAcceptedFriendships: vi.fn(),
	countSentFriendships: vi.fn(),
	countPendingFriendships: vi.fn(),
	create: vi.fn(),
	reRequest: vi.fn(),
	accept: vi.fn(),
	decline: vi.fn(),
	unfriend: vi.fn(),
	block: vi.fn(),
	unblock: vi.fn()
};

vi.mock("../../../prisma/client", () => ({
	default: {
		$transaction: vi.fn((callback) => callback({}))
	}
}));

vi.mock("../../../src/repositories/userRepository", () => ({
	UserModel: {
		findByIds: vi.fn(),
		findById: vi.fn()
	},
	UserModelTransaction: vi.fn(() => userTx)
}));

vi.mock("../../../src/repositories/friendshipRepository", () => ({
	FriendshipModel: {
		findAcceptedFriendships: vi.fn(),
		findPendingFriendships: vi.fn(),
		countPendingFriendships: vi.fn(),
		findSentFriendships: vi.fn(),
		findBlockedFriendships: vi.fn(),
		countBlockedFriendships: vi.fn(),
		findByUsers: vi.fn()
	},
	FriendshipModelTransaction: vi.fn(() => friendshipTx)
}));

import { FriendshipModel } from "../../../src/repositories/friendshipRepository";
import { UserModel } from "../../../src/repositories/userRepository";

const friendship = (overrides: Partial<Friendship> = {}): Friendship => ({
	id: 1,
	userId1: 1,
	userId2: 2,
	status: "pending",
	requestedBy: 2,
	blockedBy: null,
	createdAt: now,
	updatedAt: now,
	...overrides
});

describe("friendshipService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		friendshipTx.countAcceptedFriendships.mockResolvedValue(0);
		friendshipTx.countSentFriendships.mockResolvedValue(0);
		friendshipTx.countPendingFriendships.mockResolvedValue(0);
		userTx.findByUsername.mockResolvedValue(makeUserWithPlayer({ id: 2, username: "Friend" }));
		userTx.findById.mockResolvedValue(makeUserWithPlayer({ id: 2, username: "Friend" }));
		friendshipTx.findByUsers.mockResolvedValue(null);
		friendshipTx.create.mockResolvedValue(friendship({ id: 10, userId1: 1, userId2: 2, requestedBy: 1 }));
	});

	it("Draugus, gautus prašymus, išsiųstus prašymus ir blokuotus naudotojus grąžina kaip atsakymo naudotojus", async () => {
		vi.mocked(FriendshipModel.findAcceptedFriendships).mockResolvedValue([friendship({ status: "accepted" })]);
		vi.mocked(FriendshipModel.findPendingFriendships).mockResolvedValue([friendship({ requestedBy: 2 })]);
		vi.mocked(FriendshipModel.findSentFriendships).mockResolvedValue([friendship({ requestedBy: 1 })]);
		vi.mocked(FriendshipModel.findBlockedFriendships).mockResolvedValue([friendship({ status: "blocked" })]);
		vi.mocked(FriendshipModel.countBlockedFriendships).mockResolvedValue(1);
		vi.mocked(UserModel.findByIds).mockResolvedValue([makeUserWithPlayer({ id: 2, username: "Friend" })]);

		await expect(friendshipService.getFriends(1, "fri")).resolves.toEqual([{ id: 2, username: "Friend", player: { id: 10, iconEtag: "etag" } }]);
		await expect(friendshipService.getPendingRequests(1)).resolves.toHaveLength(1);
		await expect(friendshipService.getSentRequests(1)).resolves.toHaveLength(1);
		await expect(friendshipService.getBlockedUsers(1, { offset: 0, limit: 10 })).resolves.toMatchObject({ total: 1, data: [{ id: 2 }] });
	});

	it("Po limitų patikrinimo išsiunčia naują draugystės prašymą", async () => {
		await expect(friendshipService.sendFriendRequest(1, "Friend")).resolves.toMatchObject({
			targetUser: { id: 2, username: "Friend" }
		});

		expect(friendshipTx.create).toHaveBeenCalledWith({ userId1: 1, userId2: 2, requestedBy: 1 });
	});

	it("Atmeta netinkamus draugystės prašymus ir prašymų limitų viršijimą", async () => {
		userTx.findByUsername.mockResolvedValueOnce(null);
		await expect(friendshipService.sendFriendRequest(1, "Missing")).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FOUND });

		userTx.findByUsername.mockResolvedValueOnce(makeUserWithPlayer({ id: 1 }));
		await expect(friendshipService.sendFriendRequest(1, "Self")).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });

		friendshipTx.countSentFriendships.mockResolvedValueOnce(10);
		await expect(friendshipService.sendFriendRequest(1, "Friend")).rejects.toMatchObject({ code: ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED });
	});

	it("Siunčiant draugystės prašymą apdoroja esamas draugystės būsenas", async () => {
		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "accepted" }));
		await expect(friendshipService.sendFriendRequest(1, "Friend")).rejects.toMatchObject({ code: ErrorCode.FRIENDSHIP_ALREADY_EXISTS });

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "pending", requestedBy: 1 }));
		await expect(friendshipService.sendFriendRequest(1, "Friend")).rejects.toMatchObject({ code: ErrorCode.FRIENDSHIP_ALREADY_SENT });

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "pending", requestedBy: 2 }));
		await expect(friendshipService.sendFriendRequest(1, "Friend")).rejects.toMatchObject({ code: ErrorCode.FRIEND_REQUEST_EXISTS });

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "blocked", blockedBy: 2 }));
		await expect(friendshipService.sendFriendRequest(1, "Friend")).rejects.toMatchObject({ code: ErrorCode.USER_BLOCKED });
	});

	it("Priima, atmeta, pašalina, atšaukia ir atblokuoja tik tinkamus ryšius", async () => {
		friendshipTx.findByUsers.mockResolvedValue(friendship({ status: "pending", requestedBy: 2 }));
		await expect(friendshipService.acceptFriendRequest(1, 2)).resolves.toMatchObject({ targetUser: { id: 2 } });
		expect(friendshipTx.accept).toHaveBeenCalledWith(1);

		await friendshipService.rejectFriendRequest(1, 2);
		expect(friendshipTx.decline).toHaveBeenCalledWith(1);

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "accepted" }));
		await friendshipService.removeFriend(1, 2);
		expect(friendshipTx.unfriend).toHaveBeenCalledWith(1);

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "pending", requestedBy: 1 }));
		await friendshipService.cancelFriendRequest(1, 2);
		expect(friendshipTx.decline).toHaveBeenCalledWith(1);

		friendshipTx.findByUsers.mockResolvedValueOnce(friendship({ status: "blocked", blockedBy: 1 }));
		await friendshipService.unblockUser(1, 2);
		expect(friendshipTx.unblock).toHaveBeenCalledWith(1);
	});

	it("Blokuoja naudotojus, patikrina draugystės būseną ir grąžina patvirtintus id", async () => {
		await expect(friendshipService.blockUser(1, 2)).resolves.toMatchObject({ targetUser: { id: 2 } });
		expect(friendshipTx.block).toHaveBeenCalledWith(10, 1);

		vi.mocked(FriendshipModel.findByUsers).mockResolvedValueOnce(friendship({ status: "pending" }));
		await expect(friendshipService.ensureUsersAreFriends(1, 2)).rejects.toMatchObject({ code: ErrorCode.USER_NOT_FRIEND });

		vi.mocked(FriendshipModel.findAcceptedFriendships).mockResolvedValueOnce([
			friendship({ status: "accepted", userId1: 1, userId2: 2 }),
			friendship({ status: "accepted", userId1: 3, userId2: 1 })
		]);
		await expect(friendshipService.getAcceptedFriendIds(1)).resolves.toEqual(new Set([2, 3]));
	});
});
