import type { ApiResponse } from "../types";
import type { CreateNoteRequest, Note, UpdateNoteRequest } from "../types/note";
import { apiRequest } from "./api/apiRequest";
import api from "./api/api";

export const noteService = {
	async getAllNotes(): Promise<ApiResponse<Note[]>> {
		const res = await apiRequest<Note[]>(api, {
			method: "GET",
			url: "/notes/get"
		});

		return res;
	},

	async getNoteById(id: number): Promise<ApiResponse<Note>> {
		const res = await apiRequest<Note>(api, {
			method: "GET",
			url: `/notes/get/${id}`
		});

		return res;
	},

	async createNote(data: CreateNoteRequest): Promise<ApiResponse<Note>> {
		const res = await apiRequest<Note>(api, {
			method: "POST",
			url: "/notes/create",
			data
		});

		return res;
	},

	async updateNote(id: number, data: UpdateNoteRequest): Promise<ApiResponse<void>> {
		const res = await apiRequest<void>(api, {
			method: "PATCH",
			url: `/notes/update/${id}`,
			data
		});

		return res;
	},

	async deleteNote(id: number): Promise<ApiResponse<void>> {
		const res = await apiRequest<void>(api, {
			method: "DELETE",
			url: `/notes/delete/${id}`
		});

		return res;
	}
};