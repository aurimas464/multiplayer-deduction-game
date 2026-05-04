import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { PlusIcon, MagnifyingGlassIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "../../hooks/useTranslation";
import { usePopup } from "../../contexts/PopupContext";
import { Tooltip } from "../Tooltip";
import { noteService } from "../../services/note";
import type { Note } from "../../types/note";
import "../../css/note.css";

// To bring to top already opened ones, avoids mismatches
type Props = {
	notePopupIds: Map<number, string>;
};

const Notes = ({ notePopupIds }: Props) => {
	const { t } = useTranslation();
	const { showPopup, closePopup, bringPopupToFront } = usePopup();

	const [notes, setNotes] = useState<Note[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [noteFilter, setNoteFilter] = useState("");
	const [debouncedNoteFilter, setDebouncedNoteFilter] = useState("");

	const actionLock = useRef(false);

	// Newest on top
	const sortByUpdatedAt = useCallback((items: Note[]) => {
		return [...items].sort((a, b) => {
			const aTime = new Date(a.updatedAt || a.createdAt).getTime() || 0;
			const bTime = new Date(b.updatedAt || b.createdAt).getTime() || 0;
			return bTime - aTime;
		});
	}, []);

	// Apply filter
	const filteredNotes = useMemo(() => {
		const query = debouncedNoteFilter.trim().toLowerCase();

		if (!query) return notes;

		return notes.filter((note) => note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query));
	}, [debouncedNoteFilter, notes]);

	// Update notes list when something changes
	const handleNoteChanged = useCallback((changedNote?: Note) => {
		if (!changedNote) return;
		setNotes((prev) => {
			const exists = prev.some((note) => note.id === changedNote.id);
			const next = exists ? prev.map((note) => note.id === changedNote.id ? changedNote : note) : [changedNote, ...prev];
			return sortByUpdatedAt(next);
		});
	}, [sortByUpdatedAt]);

	// Fetch all notes
	const fetchNotes = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await noteService.getAllNotes().catch(() => null);

			if (response?.success && Array.isArray(response.result)) {
				setNotes(sortByUpdatedAt(response.result));
			} else {
				setNotes([]);

				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message: t("notes.error.fetchNotes") },
					autoCloseDelay: 5000
				});
			}
		} finally {
			setIsLoading(false);
		}
	}, [showPopup, sortByUpdatedAt, t]);

	// Fetch notes on mount
	useEffect(() => {
		const timer = window.setTimeout(() => void fetchNotes(), 0);
		return () => window.clearTimeout(timer);
	}, [fetchNotes]);

	// Debounce filter input so typing does not refilter on every keystroke
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedNoteFilter(noteFilter);
		}, 500);

		return () => clearTimeout(timer);
	}, [noteFilter]);

	const openCreatePopup = () => {
		showPopup({
			type: "note",
			title: t("notes.actions.new"),
			position: "center",
			width: 500,
			height: 500,
			payload: {
				mode: "create",
				onChanged: handleNoteChanged
			}
		});
	};

	const openViewPopup = (note: Note) => {
		const existingPopupId = notePopupIds.get(note.id);

		if (existingPopupId) {
			if (bringPopupToFront(existingPopupId)) {
				return;
			}

			notePopupIds.delete(note.id);
		}

		const popupId = showPopup({
			type: "note",
			title: note.title,
			position: "center",
			width: 500,
			height: 500,
			payload: {
				mode: "view",
				noteId: note.id,
				initialNote: note,
				onChanged: handleNoteChanged
			}
		});

		notePopupIds.set(note.id, popupId);
	};

	const openEditPopup = (note: Note, e: MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();

		const existingPopupId = notePopupIds.get(note.id);

		if (existingPopupId) {
			if (bringPopupToFront(existingPopupId)) {
				return;
			}

			notePopupIds.delete(note.id);
		}

		const popupId = showPopup({
			type: "note",
			title: note.title,
			position: "center",
			width: 500,
			height: 500,
			payload: {
				mode: "edit",
				noteId: note.id,
				initialNote: note,
				onChanged: handleNoteChanged
			}
		});

		notePopupIds.set(note.id, popupId);
	};
	
	const deleteNote = async (note: Note) => {
		if (actionLock.current) return;

		actionLock.current = true;

		const loadingId = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {},
		});

		try {
			const response = await noteService.deleteNote(note.id).catch(() => null);

			if (response?.success) {
				setNotes((prev) => prev.filter((item) => item.id !== note.id));

				showPopup({
					type: "success",
					title: t("common.success"),
					payload: { message: t("notes.delete.success") },
					autoCloseDelay: 5000
				});

				return;
			}

			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("notes.delete.error") },
				autoCloseDelay: 5000
			});
		} finally {
			closePopup(loadingId);
			actionLock.current = false;
		}
	};

	const handleDeleteNote = (note: Note, e: MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();

		if (actionLock.current) return;

		showPopup({
			type: "confirm",
			title: t("notes.delete.confirmTitle"),
			position: "center",
			payload: {
				message: t("notes.delete.confirmMessage", { title: note.title }),
				onConfirm: () => {
					void deleteNote(note);
				}
			}
		});
	};

	return (
		<div className="container">
			<button className="custom-button notes-create-button" onClick={openCreatePopup}>
				<PlusIcon/>
				<span>{t("notes.actions.new")}</span>
			</button>

			<div className="notes-filter">
				<MagnifyingGlassIcon className="filter-icon" />

				<input
					type="text"
					name="noteSearch"
					value={noteFilter}
					onChange={(e) => setNoteFilter(e.target.value)}
					placeholder={t("notes.search.placeholder")}
				/>
			</div>

			{isLoading ? (
				<div className="loading">{t("common.loading")}</div>
			) : (
				<div className="notes-card-list">
					{filteredNotes.map((note) => (
						<div
							key={note.id.toString()}
							className="note-card-item"
							onClick={() => openViewPopup(note)}
						>
							<div className="note-card-main">
								<div className="note-card-header">
									<h3 className="note-card-title">{note.title}</h3>
								</div>

								<div className="note-card-message-row">
									<p className="note-card-content">
										{note.content.length > 100 ? `${note.content.slice(0, 100)}...` : note.content}
									</p>
								</div>
							</div>

							<div className="note-card-actions">
								<Tooltip content={t("notes.actions.edit")} position="top" showDelay={500}>
									<button
										type="button"
										className="note-action-button"
										onClick={(e) => openEditPopup(note, e)}
										aria-label={t("notes.actions.edit")}
									>
										<PencilSquareIcon />
									</button>
								</Tooltip>

								<Tooltip content={t("notes.actions.delete")} position="top" showDelay={500}>
									<button
										type="button"
										className="note-action-button note-action-button-danger"
										onClick={(e) => handleDeleteNote(note, e)}
										aria-label={t("notes.actions.delete")}
									>
										<TrashIcon />
									</button>
								</Tooltip>
							</div>
						</div>
					))}

					{filteredNotes.length === 0 && (
						<div className="no-notes">{t("notes.empty")}</div>
					)}
				</div>
			)}
		</div>
	);
};

export default Notes;
