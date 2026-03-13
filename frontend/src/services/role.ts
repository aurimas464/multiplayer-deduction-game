import type { ApiResponse } from "../types";
import { apiRequest } from "./api/apiRequest";
import api from "./api/api";
import type { Role } from "../types/role";

export const roleService = {
	async getRoles(): Promise<ApiResponse<Role[]>> {
		const res = await apiRequest<Role[]>(api, {
			method: "GET",
			url: "/roles/get"
		});

		return res;
	}
};