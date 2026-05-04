import type { ApiResponse } from "../types";
import { apiRequest } from "./api/apiRequest";
import type { UserSettings } from "../types/settings";
import api from "./api/api";
import type { User } from "../types/settings";

export const userService = {
	async getMe(): Promise<ApiResponse<User>> {
		const res = await apiRequest<User>(api, {
			method: "GET",
			url: "/users/getme"
		});

		return res;
	},

	async saveSettings(data: UserSettings): Promise<ApiResponse<void>> {
		const res = await apiRequest<void>(api, {
			method: "PATCH",
			url: "/users/patch",
			data: {
				theme: data.theme,
				colorTheme: data.colorTheme,
				language: data.language,
				icon: data.icon,
			},
		});

		return res as ApiResponse<void>;
	},

	async getIcons(playerIds: number[]): Promise<ApiResponse<Record<number, string>>> {
		const ids = [...new Set(playerIds)].slice(0, 20);

		const res = await apiRequest<Record<number, string>>(api, {
			method: "POST",
			url: "/users/icons",
			data: { playerIds: ids },
		});

		return res;
	},
};
