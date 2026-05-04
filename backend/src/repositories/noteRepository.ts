import prisma from "../../prisma/client";
import type { Prisma, Note as NotePrisma } from "@prisma/client";
import type { CreateNote, Note, PatchNote } from "../types/entities/note";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapNote(note: NotePrisma): Note {
		return {
			id: note.id,
			userId: note.userId,
			title: note.title,
			content: note.content,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt
		};
	}

	async create(data: CreateNote): Promise<Note> {
		const row = await this.db.note.create({ data });

		return this.mapNote(row);
	}

	async findById(id: number): Promise<Note | null> {
		const row = await this.db.note.findUnique({
			where: { id }
		});

		return row ? this.mapNote(row) : null;
	}

	async findByUserId(userId: number): Promise<Note[]> {
		const rows = await this.db.note.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" }
		});

		return rows.map((row) => this.mapNote(row));
	}

	async patch(patch: PatchNote): Promise<void> {
		const data: Prisma.NoteUpdateInput = {};

		if (patch.content !== undefined) data.content = patch.content;
		if (patch.title !== undefined) data.title = patch.title;

		if (Object.keys(data).length === 0) return;

		await this.db.note.update({
			where: { id: patch.id },
			data
		});
	}

	async delete(id: number): Promise<void> {
		await this.db.note.delete({
			where: { id }
		});
	}
}

export const NoteModel = new Model(prisma);
export const NoteModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);
