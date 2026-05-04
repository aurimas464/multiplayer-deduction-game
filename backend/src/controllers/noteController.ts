import { Request, Response } from "express";
import { ApiResponse } from "../types";
import { ensureBody, validateData, parseNumberParam } from "../utils/validation";
import { createNoteSchema, patchNoteSchema } from "../types/entities/note";
import noteService from "../services/noteService";

class NoteController {
	async getAllNotes(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;

		const notes = await noteService.getAllNotes(userId);

		const successResponse: ApiResponse = { success: true, result: notes };
		res.status(200).json(successResponse);
	}

	async getNoteById(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const noteId = parseNumberParam(req.params, "id");

		const note = await noteService.getNoteById(noteId, userId);

		const successResponse: ApiResponse = { success: true, result: note };
		res.status(200).json(successResponse);
	}

	async createNote(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		ensureBody(req);
		const dto = validateData(createNoteSchema, { ...req.body, userId });

		const result = await noteService.createNote(dto);

		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async updateNote(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const noteId = parseNumberParam(req.params, "id");
		ensureBody(req);
		const dto = validateData(patchNoteSchema, { ...req.body, id: noteId });

		const result = await noteService.updateNote(dto, userId);
		
		const successResponse: ApiResponse = { success: true, result };
		res.status(200).json(successResponse);
	}

	async deleteNote(req: Request, res: Response): Promise<void> {
		const userId = req.user.userId;
		const noteId = parseNumberParam(req.params, "id");

		await noteService.deleteNote(noteId, userId);
		
		const successResponse: ApiResponse = { success: true };
		res.status(200).json(successResponse);
	}
}

export default new NoteController();