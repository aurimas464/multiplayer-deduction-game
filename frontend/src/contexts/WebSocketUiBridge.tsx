import { useEffect, useRef } from "react";
import { useWebSocket } from "./WebSocketContext";
import { usePopup } from "./PopupContext";
import { useTranslation } from "./useTranslation";
import { useLanguage } from "./LanguageContext";
import { ErrorCode } from "../types";
import { errorMapper } from "../utils/errorMapper";

const shouldShowErrorPopup = (error : ErrorCode) => {
	if (error === ErrorCode.UNAUTHORIZED) return false;
	return true;
};

const WebSocketUiBridge = () => {
	const { subscribe } = useWebSocket();
	const { showPopup } = usePopup();
	const { t } = useTranslation();
	const { language } = useLanguage();

	const lastRef = useRef<{ code: ErrorCode; at: number } | null>(null);
	useEffect(() => {
		return subscribe((msg) => {
			if(msg.type === "ERROR"){
				if (!shouldShowErrorPopup(msg.code)) return;

				const now = Date.now();
				if (lastRef.current?.code === msg.code && now - lastRef.current.at < 1000) return;
				lastRef.current = { code: msg.code, at: now };
				const message = errorMapper(msg.code, t, language);

				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message },
					autoCloseDelay: 5000,
				});
			}
		});
	}, [subscribe, showPopup, t, language]);

	return null;
};

export default WebSocketUiBridge;