import type { GameChatItem, SidebarChatType } from "./chat";
import type { Note } from "./note";
import type { GameFinishedAction, GameFinishedPlayer, PhaseResult, PlayerActionName, RoleAlignment } from "./websocket";
import type { RoleAlignment as CatalogRoleAlignment } from "./role";

export type PopupType =
	| "success"
	| "error"
	| "info"
	| "loading"
	| "confirm"
	| "joinGame"
	| "startingTimeout"
	| "chat"
	| "note"
	| "roleReveal"
	| "playerSelection"
	| "phaseResults"
	| "gameFinished";

export type PopupPosition =
	| "auto"
	| "center"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "minimized";

export type SuccessPopupPayload = { message?: string };
export type ErrorPopupPayload = { message?: string };
export type InfoPopupPayload = { message?: string };
export type LoadingPopupPayload = { onTimeout?: () => void };

export type ConfirmPopupPayload = {
	message?: string;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
};

export type JoinGamePopupPayload = {
	gameCode?: string;
	inviterUsername?: string;
};

export type StartingTimeoutPopupPayload = { endsAt: number; message?: string };
export type ChatPopupPayload = {
	chatId: string;
	chatName: string;
	chatType: SidebarChatType;
	directChatId?: number | null;
	gameStatus?: GameChatItem["status"];
};

export type NotePopupPayload = {
	mode: "create" | "view" | "edit";
	noteId?: number;
	initialNote?: Note;
	onChanged?: (note?: Note) => void;
};

export type RoleRevealPopupPayload = {
	roleKey: string;
	roleName: string;
	roleAlignment?: CatalogRoleAlignment | RoleAlignment | "";
};

export type PlayerSelectionPopupPayload = {
	actionType: Exclude<PlayerActionName, "skip">;
	actionLabel: string;
	actions?: Array<{
		actionType: Exclude<PlayerActionName, "skip">;
		label: string;
	}>;
	players: Array<{
		playerId: number;
		username: string;
		iconSrc: string;
	}>;
	onSubmit: (actionType: Exclude<PlayerActionName, "skip">, targetPlayerId: number) => void;
};

export type PhaseResultsPopupPayload = {
	dayNumber: number;
	resolvedPhase: "day" | "voting" | "night";
	summary: string;
	personal: string[];
	eliminated: NonNullable<PhaseResult["eliminated"]>;
	eliminatedPlayerNames: string[];
	eliminatedRows: Array<{
		playerName: string;
		roleName: string | null;
	}>;
	votes?: PhaseResult["votes"];
	votesVisible: boolean;
	voteRows: Array<{
		voterName: string;
		targetName: string | null;
	}>;
};

export type GameFinishedPopupPayload = {
	winner: RoleAlignment;
	winnerPlayerIds: number[];
	players: GameFinishedPlayer[];
	timeline: GameFinishedAction[];
	dayNumber?: number;
	playerNames: Record<number, string>;
};

export type PopupPayloadMap = {
	success: SuccessPopupPayload;
	error: ErrorPopupPayload;
	info: InfoPopupPayload;
	loading: LoadingPopupPayload;
	confirm: ConfirmPopupPayload;
	joinGame: JoinGamePopupPayload;
	startingTimeout: StartingTimeoutPopupPayload;
	chat: ChatPopupPayload;
	note: NotePopupPayload;
	roleReveal: RoleRevealPopupPayload;
	playerSelection: PlayerSelectionPopupPayload;
	phaseResults: PhaseResultsPopupPayload;
	gameFinished: GameFinishedPopupPayload;
};

export type PopupData<T extends PopupType = PopupType> = {
	id: string;

	type: T;
	title: string;

	position?: PopupPosition;
	width?: number;
	height?: number;

	autoCloseDelay?: number;
	closing?: boolean;

	payload: PopupPayloadMap[T];
};
