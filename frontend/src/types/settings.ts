export const themes = ["dark", "light"] as const;
export type Theme = (typeof themes)[number];

export const colorThemes = ["red", "blue", "purple", "gold"] as const;
export type ColorTheme = (typeof colorThemes)[number];

export const languages = ["en", "lt"] as const;
export type Language = (typeof languages)[number];

export type User = {
	id: number;
	username: string;
	email: string;
	theme: Theme;
	colorTheme: ColorTheme;
	language: Language;
	player: Player;
}

export type Player = {
	id: number;
	icon: string;
}

export type UserSettings = {
	theme: Theme;
	colorTheme: ColorTheme;
	language: Language;
	icon: string;
};