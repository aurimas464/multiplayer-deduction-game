import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";
import { usePopup } from "../contexts/PopupContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import { useWebSocketNotifyWithLoading } from "../hooks/useWebSocketNotifyWithLoading";
import "../css/GameLobby.css";
import { ErrorCode } from "../types";
import type { LobbyStateData, MetaSettings } from "../types/websocket";
import { cacheGet, cacheSet } from "../utils/localForage";
import { userService } from "../services/user";
import { errorMapper } from "../utils/errorMapper";
import { useLanguage } from "../contexts/LanguageContext";
import defaultIcon from "../assets/default-user-icon.png";
import { StarIcon, CheckCircleIcon, ClockIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useUser } from "../contexts/UserContext";
import { useLobbySettings } from "../hooks/useLobbySettings";

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
		metaSettings: {
			maxPlayers: 10,
			minPlayers: 5,
			daySeconds: 60,
			votingSeconds: 30,
			nightSeconds: 60,
			tieBehavior: "no_one_dies",
			voteCountVisibility: "end",
			anonymousVoting: false,
			roleRevealOnDeath: true
		},
		roleSettings: {}
	});
	const [loaded, setLoaded] = useState(false);

	const mountedRef = useRef(true);
	const changingSeatRef = useRef(false);
	const settingReadyRef = useRef(false);
	const leavingRef = useRef(false);

	const { draftLobbySettings, metaInputs, applyMetaSetting, updateMetaInput, flushMetaInput } = useLobbySettings({ lobbyState, onSaveSettings: (metaSettings, roleSettings, handlers) => {
		notifyWithLoading(
			{ type: "UPDATE_LOBBY_SETTINGS", metaSettings, roleSettings },
			{
				successOn: (msg) => msg.type === "UPDATE_LOBBY_SETTINGS_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.GAME_ALREADY_STARTED ||
						msg.code === ErrorCode.NOT_GAME_LEADER
					),
				onSuccess: () => {
					handlers.onSuccess();
				},
				onReject: () => {
					handlers.onReject();
				},
				onTimeout: () => {
					handlers.onTimeout();
				}
			}
		);
	}});

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;

		const syncIcons = async () => {
			const nextIcons: Record<number, string> = {};
			const idsToFetch: number[] = [];
			const etagsByPlayerId: Record<number, string | null> = {};

			for (const player of lobbyState.players) {
				const serverEtag = player.iconEtag;
				if (serverEtag == "") continue;

				const cacheKey = `player-icon-${player.playerId}`;
				const cached = await cacheGet<string>(cacheKey);
				const cachedEtag = cached?.etag;

				etagsByPlayerId[player.playerId] = serverEtag;

				if (cached?.value && cachedEtag === serverEtag) {
					nextIcons[player.playerId] = cached.value;
				} else {
					idsToFetch.push(player.playerId);
				}
			}

			if (!cancelled) {
				setPlayerIcons(nextIcons);
			}

			if (idsToFetch.length === 0) return;

			const response = await userService.getIcons(idsToFetch);
			if (cancelled) return;

			if (response.success) {
				const fetchedIcons = response.result || {};
				const mergedIcons = { ...nextIcons };

				for (const [playerIdStr, icon] of Object.entries(fetchedIcons)) {
					const playerId = Number(playerIdStr);
					const etag = etagsByPlayerId[playerId] ?? null;
					const cacheKey = `player-icon-${playerId}`;

					await cacheSet(cacheKey, icon, etag);
					mergedIcons[playerId] = icon;
				}

				if (!cancelled) {
					setPlayerIcons(mergedIcons);
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

		syncIcons().catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [lobbyState.players, language, showPopup, t]);

	const playersBySeat = useMemo(() => {
		const map = new Map<number, LobbyStateData["players"][number]>();
		for (const p of lobbyState.players) {
			map.set(p.seatNr, p);
		}
		return map;
	}, [lobbyState.players]);

	const seatNumbers = useMemo(() => {
		const max = Math.max(0, draftLobbySettings.metaSettings.maxPlayers ?? 0);
		return Array.from({ length: max }, (_, i) => i + 1);
	}, [draftLobbySettings.metaSettings.maxPlayers]);

	const myPlayerId = user?.player?.id ?? null;

	const me = useMemo(() => {
		if (!myPlayerId) return null;
		return lobbyState.players.find((p) => p.playerId === myPlayerId) ?? null;
	}, [lobbyState.players, myPlayerId]);

	const myReady = me?.isReady ?? false;

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
					(msg.code === ErrorCode.NOT_IN_LOBBY || msg.code === ErrorCode.GAME_NOT_FOUND),
				
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

	useEffect(() => {
		const unsubscribe = subscribe((msg) => {
			if (msg.type === "LOBBY_STATE") {
				setLobbyState(msg.data);
				setLoaded(true);
			}
		});

		return unsubscribe;
	}, [subscribe]);

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
					<div className="section-grid">
						<div className="section-flex lobby-box">
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
											onClick={!player && !changingSeatRef.current ? () => handleChangeSeat(seatNr) : undefined}
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
								className={["custom-button", "lobby-box", myReady ? "error" : "success"].join(" ")}
								onClick={handleToggleReady}
							>
								{myReady ? t("pages.gameLobby.unready") : t("pages.gameLobby.ready")}
							</button>

							<button
								disabled={leavingRef.current}
								className="custom-button lobby-box error"
								onClick={handleLeaveGame}
							>
								{t("pages.gameLobby.leave")}
							</button>
						</div>
					</div>

					<div className="section-grid">
						<div className="section-flex lobby-box">
							<div className="lobby-box-header">
								<h2>{t("pages.gameLobby.settings.title")}</h2>
							</div>

							<div className="settings-options">
								<div className="settings-row">
									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.maxPlayers")}</span>

										<div className="custom-input-stepper">
											<input
												className="input"
												type="number"
												value={metaInputs.maxPlayers}
												onChange={(e) => updateMetaInput("maxPlayers", e.target.value)}
												onBlur={() => flushMetaInput("maxPlayers")}
											/>
											<div className="input-controls">
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("maxPlayers", String((Number(metaInputs.maxPlayers) || draftLobbySettings.metaSettings.maxPlayers) + 1))}><ChevronUpIcon className="h-4 w-4" /></button>
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("maxPlayers", String((Number(metaInputs.maxPlayers) || draftLobbySettings.metaSettings.maxPlayers) - 1))}><ChevronDownIcon className="h-4 w-4" /></button>
											</div>
										</div>
									</div>

									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.minPlayers")}</span>

										<div className="custom-input-stepper">
											<input
												className="input"
												type="number"
												value={metaInputs.minPlayers}
												onChange={(e) => updateMetaInput("minPlayers", e.target.value)}
												onBlur={() => flushMetaInput("minPlayers")}
											/>
											<div className="input-controls">
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("minPlayers", String((Number(metaInputs.minPlayers) || draftLobbySettings.metaSettings.minPlayers) + 1))}><ChevronUpIcon className="h-4 w-4" /></button>
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("minPlayers", String((Number(metaInputs.minPlayers) || draftLobbySettings.metaSettings.minPlayers) - 1))}><ChevronDownIcon className="h-4 w-4" /></button>
											</div>
										</div>
									</div>
								</div>

								<div className="settings-row">
									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.dayTime")}</span>

										<div className="custom-input-stepper">
											<input
												className="input"
												type="number"
												value={metaInputs.daySeconds}
												onChange={(e) => updateMetaInput("daySeconds", e.target.value)}
												onBlur={() => flushMetaInput("daySeconds")}
											/>

											<div className="input-controls">
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("daySeconds", String((Number(metaInputs.daySeconds) || draftLobbySettings.metaSettings.daySeconds) + 1))}><ChevronUpIcon className="h-4 w-4" /></button>
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("daySeconds", String((Number(metaInputs.daySeconds) || draftLobbySettings.metaSettings.daySeconds) - 1))}><ChevronDownIcon className="h-4 w-4" /></button>
											</div>
										</div>
									</div>

									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.votingTime")}</span>

										<div className="custom-input-stepper">
											<input
												className="input"
												type="number"
												value={metaInputs.votingSeconds}
												onChange={(e) => updateMetaInput("votingSeconds", e.target.value)}
												onBlur={() => flushMetaInput("votingSeconds")}
											/>

											<div className="input-controls">
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("votingSeconds", String((Number(metaInputs.votingSeconds) || draftLobbySettings.metaSettings.votingSeconds) + 1))}><ChevronUpIcon className="h-4 w-4" /></button>
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("votingSeconds", String((Number(metaInputs.votingSeconds) || draftLobbySettings.metaSettings.votingSeconds) - 1))}><ChevronDownIcon className="h-4 w-4" /></button>
											</div>
										</div>
									</div>
									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.nightTime")}</span>

										<div className="custom-input-stepper">
											<input
												className="input"
												type="number"
												value={metaInputs.nightSeconds}
												onChange={(e) => updateMetaInput("nightSeconds", e.target.value)}
												onBlur={() => flushMetaInput("nightSeconds")}
											/>

											<div className="input-controls">
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("nightSeconds", String((Number(metaInputs.nightSeconds) || draftLobbySettings.metaSettings.nightSeconds) + 1))}><ChevronUpIcon className="h-4 w-4" /></button>
												<button type="button" className="custom-input-button" onClick={() => updateMetaInput("nightSeconds", String((Number(metaInputs.nightSeconds) || draftLobbySettings.metaSettings.nightSeconds) - 1))}><ChevronDownIcon className="h-4 w-4" /></button>
											</div>
										</div>
									</div>
								</div>

								<div className="settings-row">
									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.tieBehavior")}</span>
										<select
											className="custom-dropdown"
											value={draftLobbySettings.metaSettings.tieBehavior}
											onChange={(e) =>
												applyMetaSetting("tieBehavior", e.target.value as MetaSettings["tieBehavior"])
											}
										>
											<option value="no_one_dies">{t("pages.gameLobby.settings.dropdown.noOneDies")}</option>
											<option value="random_among_tied">{t("pages.gameLobby.settings.dropdown.randomTied")}</option>
											<option value="revote">{t("pages.gameLobby.settings.dropdown.revote")}</option>
										</select>
									</div>

									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.voteVisibility")}</span>
										<select
											className="custom-dropdown"
											value={draftLobbySettings.metaSettings.voteCountVisibility}
											onChange={(e) =>
												applyMetaSetting(
													"voteCountVisibility",
													e.target.value as MetaSettings["voteCountVisibility"]
												)
											}
										>
											<option value="never">{t("pages.gameLobby.settings.dropdown.never")}</option>
											<option value="end">{t("pages.gameLobby.settings.dropdown.end")}</option>
											<option value="live">{t("pages.gameLobby.settings.dropdown.live")}</option>
										</select>
									</div>
								</div>

								<div className="settings-row">
									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.anonymousVoting")}</span>
										<button
											type="button"
											className="custom-button small_button"
											onClick={() =>
												applyMetaSetting(
													"anonymousVoting",
													!draftLobbySettings.metaSettings.anonymousVoting
												)
											}
										>
											{draftLobbySettings.metaSettings.anonymousVoting ? t("common.on") : t("common.off")}
										</button>
									</div>

									<div className="setting-card">
										<span className="setting-label">{t("pages.gameLobby.settings.roleReveal")}</span>
										<button
											type="button"
											className="custom-button small_button"
											onClick={() =>
												applyMetaSetting(
													"roleRevealOnDeath",
													!draftLobbySettings.metaSettings.roleRevealOnDeath
												)
											}
										>
											{draftLobbySettings.metaSettings.roleRevealOnDeath ? t("common.on") : t("common.off")}
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GameLobby;