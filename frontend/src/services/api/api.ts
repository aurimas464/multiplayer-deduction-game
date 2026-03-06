import axios from "axios";
import { tokenSession } from "./tokenSession";
import { authService } from "../auth";

declare module "axios" {
	export interface InternalAxiosRequestConfig {
		_retry?: boolean;
	}
}

// Axios instance
export const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL,
	withCredentials: true,
	timeout: 15000,
});

// In-memory state management for token refresh
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

// Add failed request to queue
const addRefreshSubscriber = (cb: (token: string | null) => void) => {
	refreshSubscribers.push(cb);
};

// Notify all queued requests with new token
const onRefreshed = (newToken: string | null) => {
	const subscribers = refreshSubscribers;
	refreshSubscribers = [];
	for (const cb of subscribers) {
		try { cb(newToken); }
		catch {
			// ignore
		}
	}
};

// Unauthorized logout handler
let onUnauthorizedLogout: (() => void) | null = null;
let didLogout = false;
export const setOnUnauthorizedLogout = (handler: () => void) => {
	onUnauthorizedLogout = handler;
	didLogout = false;
};

const getPath = (url?: string) => {
	try {
		return new URL(url ?? "", api.defaults.baseURL).pathname;
	} catch {
		return url ?? "";
	}
};
const isAuthUrl = (url?: string) => getPath(url).includes("/auth/");
const isRefreshUrl = (url?: string) => getPath(url).endsWith("/auth/refresh");

const forceLogout = () => {
	if (didLogout) return;
	didLogout = true;
	onRefreshed(null);
	tokenSession.clear();
	onUnauthorizedLogout?.();
};

api.interceptors.request.use(
	(config) => {
		const token = tokenSession.get();

		if (token && !isAuthUrl(config.url)) {
			config.headers = config.headers ?? {};
			config.headers.Authorization = `Bearer ${token}`;
		}

		return config;
	},
	(error) => Promise.reject(error)
);

api.interceptors.response.use((response) => {
	if (import.meta.env.DEV) {
		console.log(
			response.config.method?.toUpperCase(),
			response.config.url,
			{ requestParams: response.config.params, requestBody: response.config.data, status: response.status, responseBody: response.data }
		);
	}
	return response;
}, async (error) => {
	const originalRequest = error?.config;
	if (!originalRequest) return Promise.reject(error);

	if (isAuthUrl(originalRequest.url)) {
		// If refresh itself fails, force logout
		if (isRefreshUrl(originalRequest.url)) {
			forceLogout();
		}
		return Promise.reject(error);
	}

	// Only handle 401s and prevent infinite loops
	if (error.response?.status !== 401) return Promise.reject(error);
	if (originalRequest._retry) {
		forceLogout();
		return Promise.reject(error);
	}
	originalRequest._retry = true;

	// Queue request until refresh completes (or fails)
	const retryPromise = new Promise((resolve, reject) => {
		addRefreshSubscriber((newToken) => {
			if (!newToken) {
				return reject(error);
			}

			originalRequest.headers = originalRequest.headers ?? {};
			originalRequest.headers.Authorization = `Bearer ${newToken}`;
			api(originalRequest).then(resolve).catch(reject);
		});
	});

	// Start refresh if not already in progress
	if (!isRefreshing) {
		isRefreshing = true;

		let newToken: string | null = null;
		try {
			newToken = await authService.refreshToken();
		} catch {
			newToken = null;
		} finally {
			isRefreshing = false;
			onRefreshed(newToken);
			if (!newToken) forceLogout();
		}
	}

	return retryPromise;
});

export default api;