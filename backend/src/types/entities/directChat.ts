import { z } from "zod";
import { directChatMessageSchema } from "./directChatMessage";
import { responseUserSchema } from "./user";

export const directChatSchema = z.object({
	id: z.number().int(),
	friendshipId: z.number().int(),
	lastMessageId: z.number().int().nullable(),
	lastMessageRead: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createDirectChatSchema = directChatSchema.omit({
	id: true,
	lastMessageId: true,
	lastMessageRead: true,
	createdAt: true,
	updatedAt: true
});

export const directChatItemSchema = directChatSchema.omit({
	lastMessageId: true,
	createdAt: true,
	updatedAt: true
}).extend({
	lastMessage: directChatMessageSchema.omit({
		id: true,
		chatId: true,
		updatedAt: true
	}).nullable(),
	user: responseUserSchema
});

export type DirectChat = z.infer<typeof directChatSchema>;
export type CreateDirectChat = z.infer<typeof createDirectChatSchema>;

export type DirectChatItem = z.infer<typeof directChatItemSchema>;