import { z } from "zod";
import { responsePlayerSchema } from "./player";

export const themes = ["dark", "light"] as const;
export const colorThemes = ["red", "blue", "purple", "gold"] as const;
export const languages = ["en", "lt"] as const;

export const userSchema = z.object({
	id: z.number().int(),
	username: z.string(),
	email: z.string(),
	theme: z.enum(themes),
	colorTheme: z.enum(colorThemes),
	language: z.enum(languages),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export const responseUserBaseSchema = userSchema.omit({
	createdAt: true,
	updatedAt: true,
});

export const responseUserSchema = responseUserBaseSchema.extend({
	player: responsePlayerSchema,
}).strip();

export type User = z.infer<typeof userSchema>;
export type ResponseUser = z.infer<typeof responseUserSchema>;