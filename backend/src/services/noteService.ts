import { NoteModel } from "../repositories/noteRepository";
import { ResponseNote, ResponseNoteSchema, ResponseNotesSchema, CreateNote, PatchNote } from "../types/entities/note";
import { ErrorCode } from "../types";
import { AppError } from "../types/index";

class NoteService {
    async getAllNotes(userId: number): Promise<ResponseNote[]> {
        const notes = await NoteModel.findByUserId(userId);

        return ResponseNotesSchema.parse(notes);
    }

    async getNoteById(noteId: number, userId: number): Promise<ResponseNote> {
        const note = await NoteModel.findById(noteId);
        if (!note) {
            throw new AppError(ErrorCode.INVALID_REQUEST);
        }
        if (note.userId !== userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED);
        }

        return ResponseNoteSchema.parse(note);
    }

    async createNote(data: CreateNote): Promise<ResponseNote> {
        const result = await NoteModel.create({ ...data });

        return ResponseNoteSchema.parse(result);
    }

    async updateNote(data: PatchNote, userId: number): Promise<void> {
        const existingNote = await NoteModel.findById(data.id);
        if (!existingNote) {
            throw new AppError(ErrorCode.INVALID_REQUEST);
        }
        if (existingNote.userId !== userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED);
        }

		await NoteModel.patch({ ...data });
	
    }

    async deleteNote(noteId: number, userId: number): Promise<void> {
        const existingNote = await NoteModel.findById(noteId);
        if (!existingNote) {
            throw new AppError(ErrorCode.INVALID_REQUEST);
        }
        if (existingNote.userId !== userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED);
        }

        await NoteModel.delete(noteId);
    }
}

export default new NoteService();