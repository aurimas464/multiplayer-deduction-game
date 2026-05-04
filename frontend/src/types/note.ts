export type Note = {
	id: number;
	title: string;
	content: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateNoteRequest = {
	title: string;
	content: string;
};

export type UpdateNoteRequest = Partial<CreateNoteRequest>;
