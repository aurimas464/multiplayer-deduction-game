import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "../hooks/useTranslation";
import { usePopup } from "../contexts/PopupContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import { useWebSocketNotifyWithLoading } from "../hooks/useWebSocketNotifyWithLoading";
import "../css/GameLobby.css";
import { ErrorCode } from "../types";
import { BotDifficulty, BotPlaystyle, RoleDistributionMode, TieBehavior, VoteCountVisibility, type LobbyStateData, type MetaSettings } from "../types/websocket";
import defaultIcon from "../assets/default-user-icon.png";
import defaultBotIcon from "../assets/default-bot-icon.png";
import { StarIcon, CheckCircleIcon, ClockIcon, ChevronUpIcon, ChevronDownIcon, XMarkIcon, CpuChipIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useUser } from "../contexts/UserContext";
import { useLobbySettings } from "../hooks/useLobbySettings";
import { usePlayerIcons } from "../hooks/usePlayerIcons";
import { useRoles } from "../hooks/useRoles";
import { type RoleAlignment, type Role, roleAlignment } from "../types/role";
import { Tooltip } from "../components/Tooltip";

// Default empty lobby state used before the server sends real lobby data
const DEFAULT_LOBBY_STATE: LobbyStateData = {
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
		roleRevealOnDeath: true,
		roleDistributionMode: "exact"
	},
	roleSettings: {},
	botSettings: {},
	gameCode: "",
	gameId: 0
};

const GameLobby = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { showPopup, closePopup } = usePopup();
	const { subscribe, sendMessage } = useWebSocket();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();
	const { user } = useUser();
	const { gameCode } = useParams<{ gameCode: string }>();

	// Main lobby state received from the server
	const [lobbyState, setLobbyState] = useState<LobbyStateData>(DEFAULT_LOBBY_STATE);
	const [loaded, setLoaded] = useState(false);
	const [openBotSettingsId, setOpenBotSettingsId] = useState<number | null>(null);
	const [isSettingReady, setIsSettingReady] = useState(false);

	// Build player icon etag map so icons can be loaded/cached by player id
	const playerEtags = useMemo(() => {
		return lobbyState.players.reduce((acc, p) => {
			if (p.iconEtag) {
				acc[p.playerId] = p.iconEtag;
			}

			return acc;
		}, {} as Record<number, string>);
	}, [lobbyState.players]);

	const playerIcons = usePlayerIcons(playerEtags);
	const roles = useRoles();

	// Local bot settings draft, saved when the bot settings tooltip closes
	const [draftBotSettings, setDraftBotSettings] = useState<LobbyStateData["botSettings"]>({});

	// Action locks prevent duplicate websocket requests while one is already running
	const mountedRef = useRef(true);
	const changingSeatRef = useRef(false);
	const settingReadyRef = useRef(false);
	const leavingRef = useRef(false);
	const kickingRef = useRef(false);
	const settingsLockRef = useRef(false);
	const botSettingsLockRef = useRef(false);
	const requestedLobbyStateGameCodeRef = useRef<string | null>(null);

	// Refs used for game-start popup and bot settings tooltip handling
	const startingPopupRef = useRef<string | null>(null);
	const botSettingsInitialRef = useRef<{ botId: number; difficulty: typeof BotDifficulty[number]; playstyle: typeof BotPlaystyle[number] } | null>(null);
	const botSettingsContentRef = useRef<HTMLDivElement | null>(null);
	const botDifficultySelectRef = useRef<HTMLSelectElement | null>(null);
	const botPlaystyleSelectRef = useRef<HTMLSelectElement | null>(null);
	const botTriggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});

	// Resolve current player and leader state early because settings permissions depend on it
	const myPlayerId = user?.player?.id ?? null;
	const leader = useMemo(() => {
		return lobbyState.players.find((p) => p.seatNr === 1) ?? null;
	}, [lobbyState.players]);
	const isLeader = leader?.playerId === myPlayerId;

	// Lobby settings are edited locally first and saved through websocket with debounce
	const { draftLobbySettings, metaInputs, applyMetaSetting, updateMetaInput, flushMetaInput, stepMetaInput, applyRoleSetting } = useLobbySettings({
		lobbyState,
		canEdit: isLeader,
		onSaveSettings: (metaSettings, roleSettings, handlers) => {
			if (!isLeader) {
				handlers.onReject();
				return;
			}

			notifyWithLoading(
				{ type: "UPDATE_LOBBY_SETTINGS", metaSettings, roleSettings },
				{
					successOn: (msg) => msg.type === "UPDATE_LOBBY_SETTINGS_OK",
					rejectOn: (msg) =>
						msg.type === "ERROR" &&
						(
							msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
							msg.code === ErrorCode.GAME_NOT_FOUND ||
							msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
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
				},
				settingsLockRef
			);
		}
	});

	useEffect(() => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
		};
	}, []);

	const playersBySeat = useMemo(() => {
		const map = new Map<number, LobbyStateData["players"][number]>();

		for (const p of lobbyState.players) {
			map.set(p.seatNr, p);
		}

		return map;
	}, [lobbyState.players]);

	// Render seats based on current max players setting
	const seatNumbers = useMemo(() => {
		const max = Math.max(0, draftLobbySettings.metaSettings.maxPlayers ?? 0);
		return Array.from({ length: max }, (_, i) => i + 1);
	}, [draftLobbySettings.metaSettings.maxPlayers]);

	// Group roles by alignment for the role settings sections
	const rolesByAlignment = useMemo<Record<RoleAlignment, Role[]>>(() => {
		const grouped: Record<RoleAlignment, Role[]> = { vampire: [], commune: [], neutral: [] };
		for (const role of roles) {
			grouped[role.alignment].push(role);
		}
		return grouped;
	}, [roles]);

	// Validate role setup before the game can be started
	const playerCount = lobbyState.players.length;
	const roleValidation = useMemo(() => {
		const roleSettings = draftLobbySettings.roleSettings;
		const distributionMode = draftLobbySettings.metaSettings.roleDistributionMode;

		if (distributionMode === "exact") {
			const totalRoles = Object.values(roleSettings).reduce((sum, count) => sum + (count || 0), 0);
			const isValid = totalRoles === playerCount;

			return {
				isValid,
				message: isValid ? "" : t("pages.gameLobby.validation.rolesMustEqualPlayers", { totalRoles: String(totalRoles), playerCount: String(playerCount) }),
				type: "exact" as const
			};
		}

		const enabledRoles = roles.filter((r) => (roleSettings[r.id] || 0) > 0);
		const hasCommune = enabledRoles.some((r) => r.alignment === "commune");
		const hasVampire = enabledRoles.some((r) => r.alignment === "vampire");
		const isValid = hasCommune && hasVampire;

		return {
			isValid,
			message: isValid ? "" : t("pages.gameLobby.validation.needCommuneAndVampire"),
			type: "weighted" as const,
			hasCommune,
			hasVampire
		};
	}, [draftLobbySettings.roleSettings, draftLobbySettings.metaSettings.roleDistributionMode, playerCount, roles, t]);

	// Resolve current player state
	const me = useMemo(() => {
		if (!myPlayerId) return null;
		return lobbyState.players.find((p) => p.playerId === myPlayerId) ?? null;
	}, [lobbyState.players, myPlayerId]);
	const myReady = me?.isReady ?? false;

	// Main websocket lobby event listener
	useEffect(() => {
		const unsubscribe = subscribe((msg) => {
			switch (msg.type) {
				case "LOBBY_STATE":
					if (msg.data.gameCode !== gameCode) return;

					setLobbyState(msg.data);
					setLoaded(true);
					break;
				case "KICKED_FROM_GAME":
					showPopup({
						type: "info",
						title: t("common.info"),
						payload: { message: t("pages.gameLobby.kickedFromGame") },
						autoCloseDelay: 15000
					});
					navigate("/home", { replace: true });
					break;
				case "GAME_STARTING":
					if (startingPopupRef.current) {
						closePopup(startingPopupRef.current);
					}

					startingPopupRef.current = showPopup({
						type: "startingTimeout",
						title: t("pages.gameLobby.gameStarting"),
						payload: { endsAt: msg.startsAt, message: t("pages.gameLobby.startingIn") },
						autoCloseDelay: Math.max(0, msg.startsAt - Date.now())
					});
					break;
				case "GAME_START_CANCELLED":
					if (startingPopupRef.current) {
						closePopup(startingPopupRef.current);
						startingPopupRef.current = null;
					}

					showPopup({
						type: "error",
						title: t("common.error"),
						payload: { message: t("pages.gameLobby.startCancelled") },
						autoCloseDelay: 5000
					});
					break;
				case "GAME_STARTED":
					if (startingPopupRef.current) {
						closePopup(startingPopupRef.current);
						startingPopupRef.current = null;
					}

					navigate(`/game/${gameCode}`, { replace: true });
					break;
				case "ERROR":
					if (
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY
					) {
						return;
					}
					break;
			}
		});

		return unsubscribe;
	}, [closePopup, subscribe, showPopup, navigate, t, gameCode]);

	// Request the current lobby state when entering the page
	useEffect(() => {
		if (!gameCode) {
			requestedLobbyStateGameCodeRef.current = null;
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("pages.gameLobby.gameRoomNotFound") },
				autoCloseDelay: 5000
			});
			navigate("/home", { replace: true });
			return;
		}

		if (loaded) return;

		if (requestedLobbyStateGameCodeRef.current !== gameCode) {
			requestedLobbyStateGameCodeRef.current = gameCode;
			sendMessage({ type: "REQUEST_LOBBY_STATE" });
		}

		const retry = window.setInterval(() => {
			sendMessage({ type: "REQUEST_LOBBY_STATE" });
		}, 1500);

		return () => window.clearInterval(retry);
	}, [gameCode, loaded, navigate, sendMessage, showPopup, t]);

	// Move current player to an empty seat
	const handleChangeSeat = (seatNr: number) => {
		if (changingSeatRef.current) return;

		notifyWithLoading(
			{ type: "CHANGE_SEAT", seatNr },
			{
				successOn: (msg) => msg.type === "CHANGE_SEAT_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.INVALID_SEAT ||
						msg.code === ErrorCode.SEAT_TAKEN ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND
					)
			},
			changingSeatRef
		);
	};

	// Close bot settings and save changes if difficulty/playstyle changed
	const closeBotSettings = useCallback((botId: number) => {
		if (openBotSettingsId !== botId) return;

		const initial = botSettingsInitialRef.current;
		const selectedDifficulty = (botDifficultySelectRef.current?.value as typeof BotDifficulty[number] | undefined) ?? draftBotSettings[botId]?.difficulty;
		const selectedPlaystyle = (botPlaystyleSelectRef.current?.value as typeof BotPlaystyle[number] | undefined) ?? draftBotSettings[botId]?.playstyle;

		if ( initial && initial.botId === botId && selectedDifficulty && selectedPlaystyle && ( selectedDifficulty !== initial.difficulty || selectedPlaystyle !== initial.playstyle)) {
			setDraftBotSettings((prev) => ({ ...prev, [botId]: { difficulty: selectedDifficulty, playstyle: selectedPlaystyle } }));

			notifyWithLoading(
				{ type: "CHANGE_BOT_SETTINGS", botId, difficulty: selectedDifficulty, playstyle: selectedPlaystyle },
				{
					successOn: (msg) => msg.type === "CHANGE_BOT_SETTINGS_OK",
					rejectOn: (msg) =>
						msg.type === "ERROR" &&
						(
							msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
							msg.code === ErrorCode.GAME_NOT_FOUND ||
							msg.code === ErrorCode.NOT_GAME_LEADER ||
							msg.code === ErrorCode.GAME_NOT_IN_LOBBY
						),
					onReject: () => {
						setDraftBotSettings((prev) => ({
							...prev,
							[botId]: {
								difficulty: initial.difficulty,
								playstyle: initial.playstyle
							}
						}));
					}
				},
				botSettingsLockRef
			);
		}

		setOpenBotSettingsId(null);
		botSettingsInitialRef.current = null;
	}, [draftBotSettings, notifyWithLoading, openBotSettingsId]);

	// Open bot settings and remember the original values for change detection
	const openBotSettings = useCallback((botId: number) => {
		const current = lobbyState.botSettings?.[botId] ?? draftBotSettings[botId] ?? { difficulty: BotDifficulty[0], playstyle: BotPlaystyle[0] };
		setDraftBotSettings((prev) => ({ ...prev, [botId]: { difficulty: current.difficulty, playstyle: current.playstyle } }));

		botSettingsInitialRef.current = { botId, difficulty: current.difficulty, playstyle: current.playstyle };

		setOpenBotSettingsId(botId);
	}, [draftBotSettings, lobbyState.botSettings]);

	// Toggle bot settings tooltip for one bot at a time
	const toggleBotSettings = useCallback((botId: number) => {
		if (openBotSettingsId === botId) {
			closeBotSettings(botId);
			return;
		}

		openBotSettings(botId);
	}, [closeBotSettings, openBotSettings, openBotSettingsId]);

	// Close bot settings when clicking outside the tooltip
	useEffect(() => {
		if (openBotSettingsId === null) return;

		const handleDocumentMouseDown = (event: MouseEvent) => {
			const target = event.target as Node;
			const trigger = botTriggerRefs.current[openBotSettingsId];

			if (trigger?.contains(target)) return;
			if (botSettingsContentRef.current?.contains(target)) return;

			closeBotSettings(openBotSettingsId);
		};

		document.addEventListener("mousedown", handleDocumentMouseDown);

		return () => {
			document.removeEventListener("mousedown", handleDocumentMouseDown);
		};
	}, [closeBotSettings, openBotSettingsId]);

	// Update local bot settings draft before saving on close
	const updateBotDraft = useCallback((botId: number, key: "difficulty" | "playstyle", value: LobbyStateData["botSettings"][number]["difficulty"] | LobbyStateData["botSettings"][number]["playstyle"]) => {
		setDraftBotSettings((prev) => {
			const current = prev[botId] ?? lobbyState.botSettings?.[botId] ?? { difficulty: BotDifficulty[0], playstyle: BotPlaystyle[0] };

			return { ...prev, [botId]: { ...current, [key]: value } };
		});
	}, [lobbyState.botSettings]);

	const handleSetReady = (ready: boolean) => {
		if (settingReadyRef.current) return;

		setIsSettingReady(true);

		const requestStarted = notifyWithLoading(
			{ type: "SET_READY", ready },
			{
				successOn: (msg) => msg.type === "SET_READY_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.ALREADY_IN_GAME
					),
				onSuccess: () => {
					setIsSettingReady(false);
				},
				onReject: () => {
					setIsSettingReady(false);
				},
				onTimeout: () => {
					setIsSettingReady(false);
				}
			},
			settingReadyRef
		);

		if (requestStarted === false) {
			setIsSettingReady(false);
		}
	};

	const handleToggleReady = () => {
		if (isSettingReady || settingReadyRef.current) return;

		handleSetReady(!myReady);
	};

	const handleLeaveGame = () => {
		if (leavingRef.current) return;

		leavingRef.current = true;
		void sendMessage({ type: "LEAVE_GAME" });
		navigate("/home", { replace: true });
	};

	const handleKickPlayer = (playerId: number) => {
		if (!isLeader) return;

		notifyWithLoading(
			{ type: "KICK_PLAYER", playerId },
			{
				successOn: (msg) => msg.type === "KICK_PLAYER_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.NOT_GAME_LEADER ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
						msg.code === ErrorCode.USER_NOT_FOUND
					)
			},
			kickingRef
		);
	};

	const handleAddBot = () => {
		if (!isLeader) return;

		notifyWithLoading(
			{ type: "ADD_BOT" },
			{
				successOn: (msg) => msg.type === "ADD_BOT_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.NOT_GAME_LEADER ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_FULL ||
						msg.code === ErrorCode.BOT_NOT_ADDED
					)
			}
		);
	};

	const renderRoleDetailsTooltip = (role: Role) => (
		<div className="role-details-tooltip">
			<p>{t(`roles.descriptions.${role.key}`)}</p>
			<span>{t("roles.powerLevel")}: {role.weight}</span>
		</div>
	);

	if (!loaded) {
		return (
			<div className="game-lobby-page">
				<div className="loading">{t("common.loading")}</div>
			</div>
		);
	}

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
									const isLeaderCurrent = seatNr === 1;

									return (
										<div
											key={seatNr}
											className={`player-item ${player ? "" : " player-item-empty"}`}
											role="button"
											onClick={!player ? () => handleChangeSeat(seatNr) : undefined}
										>
											<div className="player-item-left">
												<span className="player-seat">#{seatNr}</span>

												{(() => {
													const iconSrc =
														!player
															? defaultIcon
															: player.type === "bot"
																? (playerIcons[player.playerId] ?? defaultBotIcon)
																: (playerIcons[player.playerId] ?? defaultIcon);

													return (
														<img
															className="player-icon-lobby"
															src={iconSrc}
															alt=""
														/>
													);
												})()}

												<span className="player-name">
													{player ? player.username : "—"}
												</span>
											</div>

											<span className="player-item-icons">
												{player?.type === "bot" && (
													<span>
														<CpuChipIcon />
													</span>
												)}

												{player && (
													player.isReady ? (
														<span>
															<CheckCircleIcon style={{ color: "green" }} />
														</span>
													) : (
														<span>
															<ClockIcon style={{ color: "yellow" }} />
														</span>
													)
												)}

												{isLeader && player?.type === "bot" && (
													<Tooltip
														position="left"
														showDelay={0}
														hideDelay={0}
														hoverEnabled={false}
														forceVisible={openBotSettingsId === player.playerId}
														width="220px"
														className="bot-settings-popover"
														content={(
															<div
																className="bot-settings-tooltip"
																ref={(el) => {
																	if (openBotSettingsId === player.playerId) {
																		botSettingsContentRef.current = el;
																	}
																}}
															>
																<label className="setting-label">{t("pages.gameLobby.botSettings.difficulty")}</label>
																<select
																	ref={(el) => {
																		if (openBotSettingsId === player.playerId) {
																			botDifficultySelectRef.current = el;
																		}
																	}}
																	className="custom-dropdown"
																	name={`botDifficulty-${player.playerId}`}
																	value={draftBotSettings[player.playerId]?.difficulty ?? lobbyState.botSettings?.[player.playerId]?.difficulty ?? BotDifficulty[0]}
																	onChange={(e) => updateBotDraft(player.playerId, "difficulty", e.target.value as typeof BotDifficulty[number])}
																>
																	{BotDifficulty.map((difficulty) => (
																		<option key={difficulty} value={difficulty}>
																			{t(`pages.gameLobby.botSettings.difficultyOptions.${difficulty}`)}
																		</option>
																	))}
																</select>

																<label className="setting-label">{t("pages.gameLobby.botSettings.playstyle")}</label>
																<select
																	ref={(el) => {
																		if (openBotSettingsId === player.playerId) {
																			botPlaystyleSelectRef.current = el;
																		}
																	}}
																	className="custom-dropdown"
																	name={`botPlaystyle-${player.playerId}`}
																	value={draftBotSettings[player.playerId]?.playstyle ?? lobbyState.botSettings?.[player.playerId]?.playstyle ?? BotPlaystyle[0]}
																	onChange={(e) => updateBotDraft(player.playerId, "playstyle", e.target.value as typeof BotPlaystyle[number])}
																>
																	{BotPlaystyle.map((playstyle) => (
																		<option key={playstyle} value={playstyle}>
																			{t(`pages.gameLobby.botSettings.playstyleOptions.${playstyle}`)}
																		</option>
																	))}
																</select>
															</div>
														)}
													>
														<button
															ref={(el) => {
																if (el) {
																	botTriggerRefs.current[player.playerId] = el;
																} else {
																	delete botTriggerRefs.current[player.playerId];
																}
															}}
															type="button"
															className="bot-settings-trigger"
															onClick={(e) => {
																e.stopPropagation();
																toggleBotSettings(player.playerId);
															}}
														>
															<Cog6ToothIcon style={{ color: "#3b82f6" }} />
														</button>
													</Tooltip>
												)}

												{isLeaderCurrent && (
													<span>
														<StarIcon style={{ color: "goldenrod" }} />
													</span>
												)}

												{isLeader && player && player.playerId !== myPlayerId && (
													<span
														role="button"
														className="span-custom-button"
														onClick={(e) => {
															e.stopPropagation();

															if (kickingRef.current) return;

															handleKickPlayer(player.playerId);
														}}
													>
														<XMarkIcon style={{ color: "red" }} />
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
								disabled={isSettingReady}
								className={`custom-button lobby-box ${myReady ? "error" : "success"}`}
								onClick={handleToggleReady}
							>
								{myReady ? t("pages.gameLobby.unready") : t("pages.gameLobby.ready")}
							</button>

							<button
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
								<div className="settings-section">
									<div className="settings-row">
										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.maxPlayers")}</span>

											{isLeader ? (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="maxPlayers"
														value={metaInputs.maxPlayers}
														onChange={(e) => updateMetaInput("maxPlayers", e.target.value)}
														onBlur={() => flushMetaInput("maxPlayers")}
													/>

													<div className="input-controls">
														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("maxPlayers", 1)}
														>
															<ChevronUpIcon />
														</button>

														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("maxPlayers", -1)}
														>
															<ChevronDownIcon />
														</button>
													</div>
												</div>
											) : (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="maxPlayers"
														value={metaInputs.maxPlayers}
														disabled
													/>
												</div>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.minPlayers")}</span>

											{isLeader ? (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="minPlayers"
														value={metaInputs.minPlayers}
														onChange={(e) => updateMetaInput("minPlayers", e.target.value)}
														onBlur={() => flushMetaInput("minPlayers")}
													/>

													<div className="input-controls">
														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("minPlayers", 1)}
														>
															<ChevronUpIcon />
														</button>

														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("minPlayers", -1)}
														>
															<ChevronDownIcon />
														</button>
													</div>
												</div>
											) : (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="minPlayers"
														value={metaInputs.minPlayers}
														disabled
													/>
												</div>
											)}
										</div>
									</div>

									<div className="settings-row">
										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.dayTime")}</span>

											{isLeader ? (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="daySeconds"
														value={metaInputs.daySeconds}
														onChange={(e) => updateMetaInput("daySeconds", e.target.value)}
														onBlur={() => flushMetaInput("daySeconds")}
													/>

													<div className="input-controls">
														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("daySeconds", 1)}
														>
															<ChevronUpIcon />
														</button>

														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("daySeconds", -1)}
														>
															<ChevronDownIcon />
														</button>
													</div>
												</div>
											) : (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="daySeconds"
														value={metaInputs.daySeconds}
														disabled
													/>
												</div>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.votingTime")}</span>

											{isLeader ? (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="votingSeconds"
														value={metaInputs.votingSeconds}
														onChange={(e) => updateMetaInput("votingSeconds", e.target.value)}
														onBlur={() => flushMetaInput("votingSeconds")}
													/>

													<div className="input-controls">
														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("votingSeconds", 1)}
														>
															<ChevronUpIcon />
														</button>

														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("votingSeconds", -1)}
														>
															<ChevronDownIcon />
														</button>
													</div>
												</div>
											) : (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="votingSeconds"
														value={metaInputs.votingSeconds}
														disabled
													/>
												</div>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.nightTime")}</span>

											{isLeader ? (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="nightSeconds"
														value={metaInputs.nightSeconds}
														onChange={(e) => updateMetaInput("nightSeconds", e.target.value)}
														onBlur={() => flushMetaInput("nightSeconds")}
													/>

													<div className="input-controls">
														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("nightSeconds", 1)}
														>
															<ChevronUpIcon />
														</button>

														<button
															type="button"
															className="custom-input-button"
															onClick={() => stepMetaInput("nightSeconds", -1)}
														>
															<ChevronDownIcon />
														</button>
													</div>
												</div>
											) : (
												<div className="custom-input-stepper">
													<input
														className="input"
														type="number"
														name="nightSeconds"
														value={metaInputs.nightSeconds}
														disabled
													/>
												</div>
											)}
										</div>
									</div>

									<div className="settings-row">
										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.tieBehavior")}</span>

											{isLeader ? (
												<select
													className="custom-dropdown"
													name="tieBehavior"
													value={draftLobbySettings.metaSettings.tieBehavior}
													onChange={(e) => applyMetaSetting("tieBehavior", e.target.value as MetaSettings["tieBehavior"])}
												>
													{TieBehavior.map((behavior) => (
														<option key={behavior} value={behavior}>
															{t(`pages.gameLobby.settings.dropdown.${behavior}`)}
														</option>
													))}
												</select>
											) : (
												<select
													className="custom-dropdown"
													name="tieBehavior"
													value={draftLobbySettings.metaSettings.tieBehavior}
													disabled
												>
													{TieBehavior.map((behavior) => (
														<option key={behavior} value={behavior}>
															{t(`pages.gameLobby.settings.dropdown.${behavior}`)}
														</option>
													))}
												</select>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.roleDistributionMode")}</span>

											{isLeader ? (
												<select
													className="custom-dropdown"
													name="roleDistributionMode"
													value={draftLobbySettings.metaSettings.roleDistributionMode}
													onChange={(e) =>
														applyMetaSetting(
															"roleDistributionMode",
															e.target.value as MetaSettings["roleDistributionMode"]
														)
													}
												>
													{RoleDistributionMode.map((mode) => (
														<option key={mode} value={mode}>
															{t(`pages.gameLobby.settings.dropdown.${mode}`)}
														</option>
													))}
												</select>
											) : (
												<select
													className="custom-dropdown"
													name="roleDistributionMode"
													value={draftLobbySettings.metaSettings.roleDistributionMode}
													disabled
												>
													{RoleDistributionMode.map((mode) => (
														<option key={mode} value={mode}>
															{t(`pages.gameLobby.settings.dropdown.${mode}`)}
														</option>
													))}
												</select>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.voteVisibility")}</span>

											{isLeader ? (
												<select
													className="custom-dropdown"
													name="voteCountVisibility"
													value={draftLobbySettings.metaSettings.voteCountVisibility}
													onChange={(e) =>
														applyMetaSetting(
															"voteCountVisibility",
															e.target.value as MetaSettings["voteCountVisibility"]
														)
													}
												>
													{VoteCountVisibility.map((visibility) => (
														<option key={visibility} value={visibility}>
															{t(`pages.gameLobby.settings.dropdown.${visibility}`)}
														</option>
													))}
												</select>
											) : (
												<select
													className="custom-dropdown"
													name="voteCountVisibility"
													value={draftLobbySettings.metaSettings.voteCountVisibility}
													disabled
												>
													{VoteCountVisibility.map((visibility) => (
														<option key={visibility} value={visibility}>
															{t(`pages.gameLobby.settings.dropdown.${visibility}`)}
														</option>
													))}
												</select>
											)}
										</div>
									</div>

									<div className="settings-row">
										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.anonymousVoting")}</span>

											{isLeader ? (
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
											) : (
												<button
													type="button"
													className="custom-button small_button"
													disabled
												>
													{draftLobbySettings.metaSettings.anonymousVoting ? t("common.on") : t("common.off")}
												</button>
											)}
										</div>

										<div className="setting-card">
											<span className="setting-label">{t("pages.gameLobby.settings.roleReveal")}</span>

											{isLeader ? (
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
											) : (
												<button
													type="button"
													className="custom-button small_button"
													disabled
												>
													{draftLobbySettings.metaSettings.roleRevealOnDeath ? t("common.on") : t("common.off")}
												</button>
											)}
										</div>
									</div>
								</div>

								{!roleValidation.isValid && (
									<div className="error-message role-validation-error">
										{roleValidation.message}
									</div>
								)}

								{(roleAlignment as readonly RoleAlignment[]).map((alignment) => (
									<div className="settings-section" key={alignment}>
										<h3 className="glow">{t(`pages.gameLobby.settings.alignments.${alignment}`)}</h3>

										<div className="settings-row">
											{rolesByAlignment[alignment].map((role) => {
												const currentCount = draftLobbySettings.roleSettings[role.id] ?? 0;
												const isEnabled = currentCount > 0;
												const isWeightedRandom =
													draftLobbySettings.metaSettings.roleDistributionMode === "weighted_random";

												return (
													<div key={role.id} className="setting-card">
														<Tooltip
															content={renderRoleDetailsTooltip(role)}
															position="auto"
															width="320px"
														>
															<span
																className="setting-label setting-label-role"
															>
																{t(`roles.keys.${role.key}`)}
															</span>
														</Tooltip>

														{isLeader ? (
															<>
																{isWeightedRandom ? (
																	<button
																		type="button"
																		className="custom-button small_button"
																		onClick={() => applyRoleSetting(role.id, isEnabled ? 0 : 1)}
																	>
																		{isEnabled ? t("common.on") : t("common.off")}
																	</button>
																) : (
																	<div className="custom-input-stepper">
																		<input
																			className="input"
																			type="number"
																			name={`roleCount-${role.id}`}
																			min={0}
																			value={currentCount}
																			onChange={(e) => applyRoleSetting(role.id, e.target.value)}
																		/>

																		<div className="input-controls">
																			<button
																				type="button"
																				className="custom-input-button"
																				onClick={() => applyRoleSetting(role.id, currentCount + 1)}
																			>
																				<ChevronUpIcon />
																			</button>

																			<button
																				type="button"
																				className="custom-input-button"
																				onClick={() => applyRoleSetting(role.id, Math.max(0, currentCount - 1))}
																			>
																				<ChevronDownIcon />
																			</button>
																		</div>
																	</div>
																)}
															</>
														) : (
															<>
																{isWeightedRandom ? (
																	<button
																		type="button"
																		className="custom-button small_button"
																		disabled
																	>
																		{isEnabled ? t("common.on") : t("common.off")}
																	</button>
																) : (
																	<div className="custom-input-stepper">
																		<input
																			className="input"
																			type="number"
																			name={`roleCount-${role.id}`}
																			min={0}
																			value={currentCount}
																			disabled
																		/>
																	</div>
																)}
															</>
														)}
													</div>
												);
											})}
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="players-actions">
							{isLeader && (
								<button
									className="custom-button lobby-box"
									onClick={handleAddBot}
								>
									{t("pages.gameLobby.addBot")}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GameLobby;
