import axios from "axios";
import type { LoginCredentials, RegisterData, AuthResponse } from "../types/auth";
import type { ApiResponse } from "../types";
import { tokenSession } from "./api/tokenSession";
import { apiRequest } from "./api/apiRequest";

const baseURL = import.meta.env.VITE_API_URL;

const authHttp = axios.create({
	baseURL,
	withCredentials: true,
	timeout: 15000,
});

export const authService = {
	setAccessToken(token: string | null) {
		tokenSession.set(token);
	},

	getAccessToken() {
		return tokenSession.get();
	},

	clearAccessToken() {
		tokenSession.clear();
	},

	async register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
		const res = await apiRequest<AuthResponse>(authHttp, {
			method: "POST",
			url: "/auth/register",
			data: {
				username: data.username,
				email: data.email,
				password: data.password,
			},
		});

		if (res.success && res.result?.accessToken) {
			this.setAccessToken(res.result.accessToken);
		}

		return res;
	},

	async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
		const res = await apiRequest<AuthResponse>(authHttp, {
			method: "POST",
			url: "/auth/login",
			data: credentials,
		});

		if (res.success && res.result?.accessToken) {
			this.setAccessToken(res.result.accessToken);
		}

		return res;
	},

	async logout(): Promise<void> {
		try {
			await apiRequest<unknown>(authHttp, {
				method: "POST",
				url: "/auth/logout",
			});
		} finally {
			this.clearAccessToken();
		}
	},

	async refreshToken(): Promise<string | null> {
		const res = await apiRequest<{ accessToken: string }>(authHttp, {
			method: "POST",
			url: "/auth/refresh",
			data: {},
			timeout: 5000,
		});

		if (res.success && res.result?.accessToken) {
			const token = res.result.accessToken;
			this.setAccessToken(token);
			return token;
		}

		this.clearAccessToken();
		return null;
	}
};