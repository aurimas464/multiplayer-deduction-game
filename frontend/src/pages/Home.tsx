import { ArrowRightStartOnRectangleIcon, PlayIcon, TrophyIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useUser } from "../contexts/UserContext";
import { useTranslation } from "../hooks/useTranslation";
import { usePopup } from "../contexts/PopupContext";
import { useWebSocketNotifyWithLoading } from "../hooks/useWebSocketNotifyWithLoading";
import { useWebSocket } from "../contexts/WebSocketContext";
import { ErrorCode } from "../types";
import type { GameFinishedPopupPayload } from "../types/popup";
import "../css/Home.css";

type HomeLocationState = {
	gameFinished?: GameFinishedPopupPayload;
};

const Home = () => {
	const { logout, user } = useUser();
	const { t } = useTranslation();
	const { showPopup } = usePopup();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();
	const { sendMessage } = useWebSocket();
	const navigate = useNavigate();
	const location = useLocation();

	const welcomeTitle = user?.username ? `${t("pages.home.title")}, ${user.username}!` : `${t("pages.home.title")}!`;
	const loadingRef = useRef(false);
	const shownFinishedKeyRef = useRef<string | null>(null);

	// Show game finished popup when coming from a finished game
	useEffect(() => {
		const state = location.state as HomeLocationState | null;
		const gameFinished = state?.gameFinished;
		if (!gameFinished) return;

		const key = `${gameFinished.winner}-${gameFinished.winnerPlayerIds.join(".")}-${gameFinished.players.length}-${gameFinished.timeline.length}`;
		if (shownFinishedKeyRef.current === key) return;
		shownFinishedKeyRef.current = key;

		showPopup({
			type: "gameFinished",
			title: t("pages.game.finished.title"),
			payload: gameFinished,
			width: 820,
			height: 560,
			position: "center"
		});

		// Clear state after showing popup to prevent it from showing again on refresh
		navigate("/home", { replace: true, state: null });
	}, [location.state, navigate, showPopup, t]);

	const handleCreateGame = () => {
		notifyWithLoading(
			{ type: "CREATE_GAME" },
			{
				successOn: (msg) => msg.type === "JOIN_GAME_OK",
				rejectOn: (msg) => msg.type === "ERROR" && (
						msg.code === ErrorCode.GAME_NOT_CREATED ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.ALREADY_IN_GAME ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_FULL),
				onMessage: (msg) => {
					if (msg.type !== "CREATE_GAME_OK") return;
					sendMessage({ type: "JOIN_GAME", gameCode: msg.gameCode });
				},
				onSuccess: (msg) => {
					if (msg.type === "JOIN_GAME_OK") {
						navigate(`/game-lobby/${msg.gameCode}`, { replace: true });
					}
				}
			},
			loadingRef
		);
	};

	const handleJoinGame = () => {
		showPopup({
			type: "joinGame",
			title: t("components.popups.joinGame.title"),
			payload: {}
		});
	};

	return (
		<div className="home-page">
			<div className="border-container1">
				<div className="border-container2">
					<h1>{welcomeTitle}</h1>
				</div>
			</div>

			<div className="game-options">
				<button className="game-button button-50" onClick={handleCreateGame}>
					<PlayIcon className="game-icon" />
					<span className="game-label">{t("pages.home.start")}</span>
				</button>

				<button className="game-button button-50" onClick={handleJoinGame}>
					<UserGroupIcon className="game-icon" />
					<span className="game-label">{t("pages.home.join")}</span>
				</button>

				<button className="game-button button-66" onClick={() => navigate("/statistics")}>
					<TrophyIcon className="game-icon" />
					<span className="game-label">{t("pages.home.statistics")}</span>
				</button>

				<button onClick={logout} className="game-button logout-button button-33">
					<ArrowRightStartOnRectangleIcon className="game-icon" />
					<span className="game-label">{t("pages.home.logout")}</span>
				</button>
			</div>
		</div>
	);
};

export default Home;
