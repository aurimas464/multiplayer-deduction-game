import { z } from "zod";

export const friendshipStatus = ["pending", "accepted", "blocked", "removed"] as const;
export type FriendshipStatus = (typeof friendshipStatus)[number];

export const friendshipSchema = z.object({
	id: z.number().int(),
	userId1: z.number().int(),
	userId2: z.number().int(),
	requestedBy: z.number().int(),
	blockedBy: z.number().int().nullable(),
	status: z.enum(friendshipStatus),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createFriendshipSchema = friendshipSchema.omit({
	id: true,
	status: true,
	blockedBy: true,
	createdAt: true,
	updatedAt: true
});

export type Friendship = z.infer<typeof friendshipSchema>;
export type CreateFriendship = z.infer<typeof createFriendshipSchema>;