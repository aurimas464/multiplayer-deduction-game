import { useCallback, useEffect, useRef } from "react";
import { usePopup } from "../contexts/PopupContext";
import { useTranslation } from "./useTranslation";
import { useWebSocket } from "../contexts/WebSocketContext";
import type { ClientMessage, ServerMessage } from "../types/websocket";

type NotifyOptions = {
	rejectOn: (msg: ServerMessage) => boolean;
	successOn: (msg: ServerMessage) => boolean;

	onReject?: (msg: ServerMessage) => void;
	onSuccess?: (msg: ServerMessage) => void;
	onTimeout?: () => void;
	onMessage?: (msg: ServerMessage) => void;
};

type LockRef = ReturnType<typeof useRef<boolean>>;

type Pending = NotifyOptions & {
	done: boolean;
	lockRef?: LockRef;
};

// Hook for using web socket notifications with loading popups
export const useWebSocketNotifyWithLoading = () => {
	const { showPopup, closePopup } = usePopup();
	const { t } = useTranslation();
	const { sendMessage, subscribe } = useWebSocket();

	const pendingsRef = useRef<Map<string, Pending>>(new Map());

	const finish = useCallback((loadingPopupId: string, fn: (p: Pending) => void) => {
		const pending = pendingsRef.current.get(loadingPopupId);
		if (!pending || pending.done) return;

		pending.done = true;
		pendingsRef.current.delete(loadingPopupId);

		if (pending.lockRef) {
			pending.lockRef.current = false;
		}

		setTimeout(() => closePopup(loadingPopupId), 500);
		fn(pending);
	}, [closePopup]);

	// Handle messages
	useEffect(() => {
		const pendings = pendingsRef.current;

		const unsubscribe = subscribe((msg) => {
			for (const [loadingPopupId, pending] of pendings) {
				if (pending.done) continue;

				pending.onMessage?.(msg);

				if (pending.rejectOn(msg)) {
					finish(loadingPopupId, (p) => p.onReject?.(msg));
					continue;
				}

				if (pending.successOn(msg)) {
					finish(loadingPopupId, (p) => p.onSuccess?.(msg));
				}
			}
		});

		return () => {
			for (const [loadingPopupId] of pendings) {
				finish(loadingPopupId, (p) => p.onTimeout?.());
			}
			unsubscribe();
		};
	}, [subscribe, finish]);

	// Notify with loading
	const notifyWithLoading = useCallback((message: ClientMessage, opts: NotifyOptions, lockRef?: LockRef) => {
		if (lockRef?.current) return false;

		if (lockRef) {
			lockRef.current = true;
		}

		let loadingPopupId = "";

		loadingPopupId = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {
				onTimeout: () => {
					finish(loadingPopupId, (p) => p.onTimeout?.());
					showPopup({
						type: "error",
						title: t("common.error"),
						payload: { message: t("common.timeoutError") },
						autoCloseDelay: 5000
					});
				},
			},
		});

		pendingsRef.current.set(loadingPopupId, {
			rejectOn: opts.rejectOn,
			successOn: opts.successOn,
			onReject: opts.onReject,
			onSuccess: opts.onSuccess,
			onTimeout: opts.onTimeout,
			onMessage: opts.onMessage,
			lockRef,
			done: false,
		});

		return sendMessage(message);
	}, [finish, sendMessage, showPopup, t]);

	return { notifyWithLoading };
};
