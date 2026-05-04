import { z } from "zod";

export const noteSchema = z.object({
	id: z.number().int(),
	userId: z.number().int(),
	title: z.string(),
	content: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export const createNoteSchema = noteSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const ResponseNoteSchema = noteSchema.omit({
	userId: true,
	createdAt: true,
	updatedAt: true
});

export const ResponseNotesSchema = z.array(ResponseNoteSchema);

export const patchNoteSchema = noteSchema.omit({
	userId: true,
	createdAt: true,
	updatedAt: true
}).partial({
	content: true,
	title: true
});

export type Note = z.infer<typeof noteSchema>;
export type CreateNote = z.infer<typeof createNoteSchema>;
export type PatchNote = z.infer<typeof patchNoteSchema>;

export type ResponseNote = z.infer<typeof ResponseNoteSchema>;
export type ResponseNotes = z.infer<typeof ResponseNotesSchema>;