import { z } from "zod";
import { responsePlayerSchema } from "./player";

export const themes = ["dark", "light", "dynamic"] as const;
export type Theme = (typeof themes)[number];
export const colorThemes = ["red", "blue", "purple", "gold"] as const;
export type ColorTheme = (typeof colorThemes)[number];
export const languages = ["en", "lt"] as const;
export type Language = (typeof languages)[number];

export const userSchema = z.object({
	id: z.number().int(),
	username: z.string(),
	email: z.string(),
	password: z.string(),
	theme: z.enum(themes),
	colorTheme: z.enum(colorThemes),
	language: z.enum(languages),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createUserSchema = userSchema.omit({
	id: true,
	theme: true,
	colorTheme: true,
	language: true,
	createdAt: true,
	updatedAt: true
});

export const patchUserSchema = userSchema.omit({
	createdAt: true,
	updatedAt: true
}).extend({
	icon: z.string(),
	iconEtag: z.string()
}).partial();

export const userWithPlayerSchema = userSchema.extend({
	player: responsePlayerSchema
});

export const responseMeUserSchema = userWithPlayerSchema.omit({
	password: true,
	createdAt: true,
	updatedAt: true
});

export const responseUserSchema = userSchema.omit({
	email: true,
	password: true,
	theme: true,
	colorTheme: true,
	language: true,
	createdAt: true,
	updatedAt: true
}).extend({
	player: responsePlayerSchema
});

export const responseUsersSchema = z.array(responseUserSchema);

export type User = z.infer<typeof userSchema>;
export type UserWithPlayer = z.infer<typeof userWithPlayerSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type PatchUser = z.infer<typeof patchUserSchema>;

export type ResponseMeUser = z.infer<typeof responseMeUserSchema>;
export type ResponseUser = z.infer<typeof responseUserSchema>;
export type ResponseUsers = z.infer<typeof responseUsersSchema>;