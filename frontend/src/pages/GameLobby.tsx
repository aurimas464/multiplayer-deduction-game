import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "../contexts/useTranslation";
import { usePopup } from "../contexts/PopupContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import { useWebSocketNotifyWithLoading } from "../contexts/useWebSocketNotifyWithLoading";
import "../css/GameLobby.css";
import { ErrorCode } from "../types";
import type { LobbyStateData } from "../types/websocket";
import { cacheGet, cacheSet } from "../utils/localForage";
import { userService } from "../services/user";
import { errorMapper } from "../utils/errorMapper";
import { useLanguage } from "../contexts/LanguageContext";
import defaultIcon from "../assets/default-user-icon.png";
import { StarIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useUser } from "../contexts/UserContext";

const GameLobby = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { showPopup } = usePopup();
	const { subscribe } = useWebSocket();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();
	const { user } = useUser();
	const { language } = useLanguage();
	const { gameCode } = useParams<{ gameCode: string }>();

	const [playerIcons, setPlayerIcons] = useState<Record<number, string>>({});
	const [lobbyState, setLobbyState] = useState<LobbyStateData>({
		players: [],
		maxPlayers: 0,
		minPlayers: 0,
	});
	const [loaded, setLoaded] = useState(false);

	const mountedRef = useRef(true);
	const changingSeatRef = useRef(false);
	const settingReadyRef = useRef(false);
	const leavingRef = useRef(false);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const playersBySeat = useMemo(() => {
		const map = new Map<number, LobbyStateData["players"][number]>();
		for (const p of lobbyState.players) map.set(p.seatNr, p);
		return map;
	}, [lobbyState.players]);

	const seatNumbers = useMemo(() => {
		const max = Math.max(0, lobbyState.maxPlayers ?? 0);
		return Array.from({ length: max }, (_, i) => i + 1);
	}, [lobbyState.maxPlayers]);

	const myPlayerId = user?.player?.id ?? null;

	const me = useMemo(() => {
		if (!myPlayerId) return null;
		return lobbyState.players.find((p) => p.playerId === myPlayerId) ?? null;
	}, [lobbyState.players, myPlayerId]);
	const myReady = me?.isReady ?? false;

	useEffect(() => {
		let cancelled = false;

		const checkIcons = async () => {
			const iconsToLoad: Record<number, string> = {};

			for (const player of lobbyState.players) {
				const cacheKey = `player-icon-${player.playerId}`;
				const cached = await cacheGet<string>(cacheKey);

				if (!cached || cached.etag !== player.iconEtag) {
					iconsToLoad[player.playerId] = player.iconEtag;
				}
			}

			const ids = Object.keys(iconsToLoad).map((x) => Number(x));
			if (ids.length === 0) return;

			const response = await userService.getIcons(ids);

			if (cancelled) return;

			if (response.success) {
				for (const [playerIdStr, icon] of Object.entries(response.result || {})) {
					const playerId = Number(playerIdStr);
					const etag = iconsToLoad[playerId];
					const cacheKey = `player-icon-${playerId}`;
					await cacheSet(cacheKey, icon, etag);
				}
			} else {
				const code = response.errors?.[0]?.code;
				const errorMessage = errorMapper(code, t, language);
				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message: errorMessage },
					autoCloseDelay: 5000
				});
			}
		};

		checkIcons();

		return () => {
			cancelled = true;
		};
	}, [lobbyState.players, language, t, showPopup]);

	useEffect(() => {
		let cancelled = false;

		const loadIconsFromCache = async () => {
			const entries = await Promise.all(
				lobbyState.players.map(async (player) => {
					const cacheKey = `player-icon-${player.playerId}`;
					const cached = await cacheGet<string>(cacheKey);
					return [player.playerId, cached?.value ?? null] as const;
				})
			);

			if (cancelled) return;

			const next: Record<number, string> = {};
			for (const [playerId, icon] of entries) {
				if (icon) next[playerId] = icon;
			}
			setPlayerIcons(next);
		};

		loadIconsFromCache().catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [lobbyState.players]);

	useEffect(() => {
		if (!gameCode) {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("pages.gameLobby.gameRoomNotFound") },
				autoCloseDelay: 5000
			});
			navigate("/home", { replace: true });
			return;
		}

		notifyWithLoading(
			{ type: "REQUEST_LOBBY_STATE" },
			{
				successOn: (msg) => msg.type === "LOBBY_STATE",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND
					),

				onSuccess: (msg) => {
					if (!mountedRef.current) return;
					if (msg.type === "LOBBY_STATE") {
						setLobbyState(msg.data);
						setLoaded(true);
					}
				},

				onReject: () => {
					if (!mountedRef.current) return;
					navigate("/home", { replace: true });
				}
			}
		);
	}, [gameCode, notifyWithLoading, navigate, showPopup, t]);

	const handleChangeSeat = (seatNr: number) => {
		if (changingSeatRef.current) return;
		changingSeatRef.current = true;

		notifyWithLoading(
			{ type: "CHANGE_SEAT", seatNr },
			{
				successOn: (msg) => msg.type === "CHANGE_SEAT_OK",

				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.INVALID_SEAT ||
						msg.code === ErrorCode.SEAT_TAKEN ||
						msg.code === ErrorCode.GAME_ALREADY_STARTED ||
						msg.code === ErrorCode.NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND
					),

				onSuccess: () => {
					changingSeatRef.current = false;
				},
				onReject: () => {
					changingSeatRef.current = false;
				},
				onTimeout: () => {
					changingSeatRef.current = false;
				}
			}
		);
	};

	const handleSetReady = (ready: boolean) => {
		if (settingReadyRef.current) return;
		settingReadyRef.current = true;

		notifyWithLoading(
			{ type: "SET_READY", ready },
			{
				successOn: (msg) => msg.type === "SET_READY_OK",

				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.ALREADY_IN_GAME
					),

				onSuccess: () => {
					settingReadyRef.current = false;
				},
				onReject: () => {
					settingReadyRef.current = false;
				},
				onTimeout: () => {
					settingReadyRef.current = false;
				}
			}
		);
	};

	const handleToggleReady = () => {
		handleSetReady(!myReady);
	};

	const handleLeaveGame = () => {
		if (leavingRef.current) return;
		leavingRef.current = true;

		notifyWithLoading(
			{ type: "LEAVE_GAME" },
			{
				successOn: (msg) => msg.type === "LEAVE_GAME_OK",

				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND
					),

				onSuccess: () => {
					leavingRef.current = false;
					navigate("/home", { replace: true });
				},
				onReject: () => {
					leavingRef.current = false;
				},
				onTimeout: () => {
					leavingRef.current = false;
				}
			}
		);
	};

	useEffect(() => {
		const unsubscribe = subscribe((msg) => {
			if (msg.type === "LOBBY_STATE") {
				setLobbyState(msg.data);
				setLoaded(true);
			}
		});

		return unsubscribe;
	}, [subscribe]);

	if (!loaded) return null;

	return (
		<div className="game-lobby-page">
			<div className="lobby-container">
				<div className="lobby-header-container lobby-box">
					<span className="lobby-header-label">
						{t("pages.gameLobby.code")}:&nbsp;
					</span>
					<span className="lobby-header-code">{gameCode}</span>
				</div>

				<div className="lobby-content-layout">
					<div className="left-section">
						<div className="players-section lobby-box">
							<div className="lobby-box-header">
								<h2>{t("pages.gameLobby.players")}</h2>
							</div>

							<div className="players-seats">
								{seatNumbers.map((seatNr) => {
									const player = playersBySeat.get(seatNr);
									const isLeader = seatNr === 1;

									return (
										<div
											key={seatNr}
											className={["player-item", player ? "" : "player-item-empty"].join(" ")}
											role="button"
											onClick={!player ? () => handleChangeSeat(seatNr) : undefined}
										>
											<div className="player-item-left">
												<span className="player-seat">#{seatNr}</span>

												<img
													className="player-icon-lobby"
													src={player ? (playerIcons[player.playerId] ?? defaultIcon) : defaultIcon}
													alt=""
												/>

												<span className="player-name">
													{player ? player.username : "—"}
												</span>
											</div>

											<span className="player-item-icons">
												{player ? (
													player.isReady ? (
														<span>
															<CheckCircleIcon className="h-5 w-5" style={{ color: "green" }} />
														</span>
													) : (
														<span>
															<ClockIcon className="h-5 w-5" style={{ color: "yellow" }} />
														</span>
													)
												) : null}

												{isLeader && (
													<span>
														<StarIcon className="h-5 w-5" style={{ color: "goldenrod" }} />
													</span>
												)}
											</span>
										</div>
									);
								})}
							</div>
						</div>

						<div className="players-actions">
							<button
								disabled={settingReadyRef.current}
								className={["button", "lobby-box", myReady ? "error" : "success"].join(" ")}
								onClick={handleToggleReady}
							>
								{myReady ? t("pages.gameLobby.unready") : t("pages.gameLobby.ready")}
							</button>

							<button
								disabled={leavingRef.current}
								className="button lobby-box error"
								onClick={handleLeaveGame}
							>
								{t("pages.gameLobby.leave")}
							</button>
						</div>
					</div>

					<div className="settings-section">
						<div className="right-section lobby-box">
							<div className="lobby-box-header">
								<h2>{t("pages.gameLobby.settings")}</h2>
							</div>
						</div>

						<div className="right-actions" />
					</div>
				</div>
			</div>
		</div>
	);
};

export default GameLobby;