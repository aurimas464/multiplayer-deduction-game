import { z } from "zod";
import { responseUserSchema } from "./user";

export const directChatMessageSchema = z.object({
	id: z.number().int(),
	chatId: z.number().int(),
	senderId: z.number().int(),
	message: z.string(),
	editedAt: z.coerce.date().nullable(),
	deletedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createDirectChatMessageSchema = directChatMessageSchema.omit({
	id: true,
	editedAt: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true
});

export const responseDirectChatMessageSchema = directChatMessageSchema.extend({
	user: responseUserSchema.nullable()
});

export type DirectChatMessage = z.infer<typeof directChatMessageSchema>;
export type CreateDirectChatMessage = z.infer<typeof createDirectChatMessageSchema>;

export type ResponseDirectChatMessage = z.infer<typeof responseDirectChatMessageSchema>;