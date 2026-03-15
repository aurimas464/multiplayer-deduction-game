export type PopupType = "success" | "error" | "info" | "loading" | "joinGame";

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
export type JoinGamePopupPayload = {};

export type PopupPayloadMap = {
	success: SuccessPopupPayload;
	error: ErrorPopupPayload;
	info: InfoPopupPayload;
	loading: LoadingPopupPayload;
	joinGame: JoinGamePopupPayload;
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
}