import { ArrowRightStartOnRectangleIcon, PlayIcon, TrophyIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import { useUser } from "../contexts/UserContext";
import { useTranslation } from "../hooks/useTranslation";
import { usePopup } from "../contexts/PopupContext";
import { useWebSocketNotifyWithLoading } from "../hooks/useWebSocketNotifyWithLoading";
import { useWebSocket } from "../contexts/WebSocketContext";
import { ErrorCode } from "../types";
import "../css/Home.css";

const Home = () => {
	const { logout } = useUser();
	const { t } = useTranslation();
	const { showPopup } = usePopup();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();
	const { sendMessage } = useWebSocket();
	const navigate = useNavigate();

	const loadingRef = useRef(false);

	const handleCreateGame = () => {
		if (loadingRef.current) return;
		loadingRef.current = true;


		notifyWithLoading(
			{ type: "CREATE_GAME" },
			{
				successOn: (msg) => msg.type === "JOIN_GAME_OK",
				rejectOn: (msg) => msg.type === "ERROR" && (
						msg.code === ErrorCode.GAME_NOT_CREATED ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.ALREADY_IN_GAME ||
						msg.code === ErrorCode.GAME_ALREADY_STARTED ||
						msg.code === ErrorCode.GAME_FULL),

				onMessage: (msg) => {
					if (msg.type !== "CREATE_GAME_OK") return;
					sendMessage({ type: "JOIN_GAME", gameCode: msg.gameCode });
				},
				onSuccess: (msg) => {
					loadingRef.current = false;

					if (msg.type === "JOIN_GAME_OK") {
						navigate(`/game-lobby/${msg.gameCode}`, { replace: true });
					}
				},
				onReject: () => {
					loadingRef.current = false;
				},

				onTimeout: () => {
					loadingRef.current = false;
				}
			}
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
					<h1>{t("pages.home.title")}!</h1>
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

				<button className="game-button button-66">
					<TrophyIcon className="game-icon" />
					<span className="game-label">{t("pages.home.leaderboard")}</span>
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