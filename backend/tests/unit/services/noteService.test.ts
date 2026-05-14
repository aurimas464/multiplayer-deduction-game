import { beforeEach, describe, expect, it, vi } from "vitest";
import noteService from "../../../src/services/noteService";
import { AppError, ErrorCode } from "../../../src/types";
import { now } from "./factories";

// Mock repositories
vi.mock("../../../src/repositories/noteRepository", () => ({
	NoteModel: {
		findByUserId: vi.fn(),
		findById: vi.fn(),
		create: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { NoteModel } from "../../../src/repositories/noteRepository";

// Test data
const note = {
	id: 1,
	userId: 7,
	title: "Read",
	content: "Check the voting log",
	createdAt: now,
	updatedAt: now
};

describe("noteService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("Dabartiniam naudotojui grąžina tik atsakymo užrašo laukus", async () => {
		vi.mocked(NoteModel.findByUserId).mockResolvedValue([note]);

		await expect(noteService.getAllNotes(7)).resolves.toEqual([
			{ id: 1, title: "Read", content: "Check the voting log" }
		]);
	});

	it("Atmeta kito naudotojo užrašo skaitymą, atnaujinimą ir trynimą", async () => {
		vi.mocked(NoteModel.findById).mockResolvedValue(note);

		await expect(noteService.getNoteById(1, 8)).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
		await expect(noteService.updateNote({ id: 1, title: "New" }, 8)).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
		await expect(noteService.deleteNote(1, 8)).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
	});

	it("Grąžina vieną naudotojui priklausantį užrašą", async () => {
		vi.mocked(NoteModel.findById).mockResolvedValue(note);

		await expect(noteService.getNoteById(1, 7)).resolves.toEqual({
			id: 1,
			title: "Read",
			content: "Check the voting log"
		});
	});

	it("Grąžina netinkamos užklausos klaidą, kai užrašas neegzistuoja", async () => {
		vi.mocked(NoteModel.findById).mockResolvedValue(null);

		await expect(noteService.getNoteById(1, 7)).rejects.toBeInstanceOf(AppError);
		await expect(noteService.getNoteById(1, 7)).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
	});

	it("Neatnaujina užrašo, kai jis neegzistuoja", async () => {
		vi.mocked(NoteModel.findById).mockResolvedValue(null);

		await expect(noteService.updateNote({ id: 1, title: "Missing" }, 7)).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		expect(NoteModel.patch).not.toHaveBeenCalled();
	});

	it("Neištrina užrašo, kai jis neegzistuoja", async () => {
		vi.mocked(NoteModel.findById).mockResolvedValue(null);

		await expect(noteService.deleteNote(1, 7)).rejects.toMatchObject({ code: ErrorCode.INVALID_REQUEST });
		expect(NoteModel.delete).not.toHaveBeenCalled();
	});

	it("Sukuria, atnaujina ir ištrina savo užrašus", async () => {
		vi.mocked(NoteModel.create).mockResolvedValue(note);
		vi.mocked(NoteModel.findById).mockResolvedValue(note);

		await expect(noteService.createNote({ userId: 7, title: "Read", content: "Check the voting log" })).resolves.toEqual({
			id: 1,
			title: "Read",
			content: "Check the voting log"
		});
		await noteService.updateNote({ id: 1, content: "Updated" }, 7);
		await noteService.deleteNote(1, 7);

		expect(NoteModel.patch).toHaveBeenCalledWith({ id: 1, content: "Updated" });
		expect(NoteModel.delete).toHaveBeenCalledWith(1);
	});
});
