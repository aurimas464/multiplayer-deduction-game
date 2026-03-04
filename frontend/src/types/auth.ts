import type { User } from "./settings";

export type LoginCredentials = {
	login: string;
	password: string;
}

export type RegisterData = {
	email: string;
	password: string;
	confirmPassword: string;
	username: string;
}

export type AuthResponse = {
	user: User;
	accessToken: string;
}