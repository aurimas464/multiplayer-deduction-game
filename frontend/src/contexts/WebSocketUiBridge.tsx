import { useEffect, useRef } from "react";
import { useWebSocket } from "./WebSocketContext";
import { usePopup } from "./PopupContext";
import { useTranslation } from "../hooks/useTranslation";
import { useLanguage } from "./LanguageContext";
import { ErrorCode } from "../types";
import type { ErrorCodeType } from "../types";
import { errorMapper } from "../utils/errorMapper";
import { useLocation } from "react-router-dom";

const WebSocketUiBridge = () => {
	const { subscribe } = useWebSocket();
	const { showPopup } = usePopup();
	const { t } = useTranslation();
	const { language } = useLanguage();
	const location = useLocation();

	const lastRef = useRef<{ code: ErrorCodeType; at: number } | null>(null);
	useEffect(() => {
		return subscribe((msg) => {
			if (msg.type === "INVITED_TO_GAME") {
				showPopup({
					type: "joinGame",
					title: t("components.popups.joinGame.title"),
					width: 400,
					height: 200,
					payload: {
						gameCode: msg.gameCode,
						inviterUsername: msg.username
					}
				});
				return;
			}

			if(msg.type === "ERROR"){
				if (msg.code === ErrorCode.UNAUTHORIZED) return;

				if ((
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY
					) &&
					( location.pathname.startsWith("/game/") || location.pathname.startsWith("/game-lobby/"))) {
					return;
				}

				if (
					(
						msg.code === ErrorCode.INVALID_REQUEST ||
						msg.code === ErrorCode.INVALID_ACTION
					) && location.pathname.startsWith("/game/")) {
					return;
				}

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
	}, [subscribe, showPopup, t, language, location.pathname]);

	return null;
};

export default WebSocketUiBridge;
