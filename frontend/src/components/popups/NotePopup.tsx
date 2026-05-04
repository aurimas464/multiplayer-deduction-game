import { useRef, useState } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "../../hooks/useTranslation";
import { usePopup } from "../../contexts/PopupContext";
import { noteService } from "../../services/note";
import type { PopupData } from "../../types/popup";
import type { Note } from "../../types/note";
import Popup from "./Popup";

type NotePopupMode = "create" | "view" | "edit";

type Props = {
	popup: PopupData<"note">;
	onClose: () => void;
};

const NotePopup = ({ popup, onClose }: Props) => {
	const { t } = useTranslation();
	const { showPopup, closePopup } = usePopup();

	const payload = popup.payload;

	const [mode, setMode] = useState<NotePopupMode>(payload.mode);
	const [popupTitle, setPopupTitle] = useState(popup.title);
	const [noteId, setNoteId] = useState<number | undefined>(payload.noteId ?? payload.initialNote?.id);
	const [title, setTitle] = useState(payload.initialNote?.title ?? "");
	const [content, setContent] = useState(payload.initialNote?.content ?? "");
	const [savedSnapshot, setSavedSnapshot] = useState({
		title: payload.initialNote?.title ?? "",
		content: payload.initialNote?.content ?? "",
		createdAt: payload.initialNote?.createdAt,
		updatedAt: payload.initialNote?.updatedAt
	});

	const actionLock = useRef(false);

	const isReadonly = mode === "view";

	const hasChanges = title.trim() !== savedSnapshot.title.trim() || content.trim() !== savedSnapshot.content.trim();

	const validateNote = () => {
		if (!title.trim()) {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("notes.validation.titleRequired") },
				autoCloseDelay: 5000
			});

			return false;
		}

		if (!content.trim()) {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("notes.validation.contentRequired") },
				autoCloseDelay: 5000
			});

			return false;
		}

		return true;
	};

	const resetToViewMode = () => {
		setTitle(savedSnapshot.title);
		setContent(savedSnapshot.content);
		setMode("view");
	};

	const handleCancel = () => {
		if (mode === "edit" && hasChanges) {
			showPopup({
				type: "confirm",
				title: t("notes.cancel.confirmTitle"),
				position: "center",
				payload: {
					message: t("notes.cancel.confirmMessage"),
					onConfirm: () => {
						resetToViewMode();
					}
				}
			});
			return;
		}

		if (mode === "edit") {
			resetToViewMode();
			return;
		}

		onClose();
	};

	const saveNote = async () => {
		if (actionLock.current) return;
		if (!validateNote()) return;

		actionLock.current = true;
		const currentMode = mode;

		const request = {
			title: title.trim(),
			content: content.trim()
		};

		if (currentMode !== "create" && !noteId) {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("notes.edit.error") },
				autoCloseDelay: 5000
			});

			actionLock.current = false;
			return;
		}

		const loadingId = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {},
		});

		const response = currentMode === "create"
			? await noteService.createNote(request).catch(() => null)
			: await noteService.updateNote(Number(noteId), request).catch(() => null);

		setTimeout(() => {
			closePopup(loadingId);
		}, 500);

		setTimeout(() => {
			actionLock.current = false;
		}, 500);

		if (response?.success) {
			setPopupTitle(request.title);

			const now = new Date().toISOString();
			const createdAt = response.result && typeof response.result === "object" && "createdAt" in response.result
				? response.result.createdAt
				: (savedSnapshot.createdAt ?? now);
			const updatedAt = response.result && typeof response.result === "object" && "updatedAt" in response.result
				? response.result.updatedAt
				: now;
			const resolvedNoteId = response.result && typeof response.result === "object" && "id" in response.result
				? Number(response.result.id)
				: Number(noteId);

			const changedNote: Note | undefined = Number.isNaN(resolvedNoteId)
				? undefined
				: {
					id: resolvedNoteId,
					title: request.title,
					content: request.content,
					createdAt,
					updatedAt
				};

			if (changedNote) {
				setNoteId(changedNote.id);
				setPopupTitle(changedNote.title);
				setSavedSnapshot({
					title: changedNote.title,
					content: changedNote.content,
					createdAt: changedNote.createdAt,
					updatedAt: changedNote.updatedAt
				});
				setTitle(changedNote.title);
				setContent(changedNote.content);
				payload.onChanged?.(changedNote);
			} else {
				payload.onChanged?.();
			}

			setMode("view");

			showPopup({
				type: "success",
				title: t("common.success"),
				payload: {
					message: currentMode === "create"
						? t("notes.create.success")
						: t("notes.edit.success")
				},
				autoCloseDelay: 5000
			});
			return;
		}

		showPopup({
			type: "error",
			title: t("common.error"),
			payload: {
				message: currentMode === "create"
					? t("notes.create.error")
					: t("notes.edit.error")
			},
			autoCloseDelay: 5000
		});
	};

	const handleSaveClick = () => {
		if (mode === "edit" && !hasChanges) return;
		if (!validateNote()) return;

		void saveNote();
	};

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popupTitle}
			position={popup.position ?? "center"}
			width={popup.width ?? 500}
			height={popup.height ?? 500}
			icon={<DocumentTextIcon />}
		>
			<div className="note-popup">
				<div className="note-popup-body">
					<div className="note-form-group">
						<input
							type="text"
							name="noteTitle"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={isReadonly}
							className="note-input"
							placeholder={t("notes.fields.title")}
						/>
					</div>

					<div className="note-form-group">
						<textarea
							name="noteContent"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							disabled={isReadonly}
							className="note-textarea"
							placeholder={t("notes.fields.content")}
						/>
					</div>
				</div>

				<div className="note-popup-footer">
					{mode === "view" ? (
						<>
							<button className="custom-button" onClick={() => setMode("edit")}>
								{t("notes.actions.edit")}
							</button>

							<button className="custom-button" onClick={onClose}>
								{t("common.close")}
							</button>
						</>
					) : (
						<>
							<button
								className="custom-button"
								onClick={handleSaveClick}
								disabled={mode === "edit" && !hasChanges}
							>
								{t("common.save")}
							</button>

							<button className="custom-button" onClick={handleCancel}>
								{t("common.cancel")}
							</button>
						</>
					)}
				</div>
			</div>
		</Popup>
	);
};

export default NotePopup;
