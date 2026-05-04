import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "../components/Tooltip";
import { usePopup } from "../contexts/PopupContext";
import { useTheme } from "../contexts/ThemeContext";
import { useWebSocket } from "../contexts/WebSocketContext";
import { usePlayerIcons } from "../hooks/usePlayerIcons";
import { useRoles } from "../hooks/useRoles";
import { useTranslation } from "../hooks/useTranslation";
import defaultIcon from "../assets/default-user-icon.png";
import defaultBotIcon from "../assets/default-bot-icon.png";
import "../css/game.css";
import { ErrorCode } from "../types";
import type { GameFinishedPopupPayload } from "../types/popup";
import type { GameFinishedResult, GameStateData, PersonalPhaseResult, PhaseResult, PlayerActionName } from "../types/websocket";

type Phase = GameStateData["currentPhase"];

type ActionConfig = {
	actionType: Exclude<PlayerActionName, "skip">;
	label: string;
};

type PhaseResultsView = {
	dayNumber: number;
	resolvedPhase: Phase;
	result: PhaseResult;
};

const Game = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { theme, setDynamicTheme } = useTheme();
	const { showPopup, closePopup } = usePopup();
	const { subscribe, sendMessage } = useWebSocket();
	const { gameCode } = useParams<{ gameCode: string }>();

	// Core game state and transient UI state
	const [gameState, setGameState] = useState<GameStateData | null>(null);
	const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(0);
	const [submittedActionPhaseKey, setSubmittedActionPhaseKey] = useState<string | null>(null);
	const [chatTooltipMessages, setChatTooltipMessages] = useState<Record<number, string>>({});
	const [visibleChatTooltips, setVisibleChatTooltips] = useState<Record<number, boolean>>({});

	const roles = useRoles();

	const playerEtags = useMemo(() => {
		if (!gameState) return {};

		return gameState.players.reduce((acc, player) => {
			if (player.type !== "bot" && player.iconEtag) {
				acc[player.playerId] = player.iconEtag;
			}

			return acc;
		}, {} as Record<number, string>);
	}, [gameState]);

	const playerIcons = usePlayerIcons(playerEtags);

	// Refs for popup lifecycle, dedup keys, and pending request state
	const mountedRef = useRef(true);
	const selectionPopupIdRef = useRef<string | null>(null);
	const roleRevealPopupIdRef = useRef<string | null>(null);
	const phaseResultsPopupIdRef = useRef<string | null>(null);
	const actionLoadingPopupIdRef = useRef<string | null>(null);
	const chatTooltipTimersRef = useRef<Map<number, number>>(new Map());
	const shownRoleRevealKeyRef = useRef<string | null>(null);
	const shownPhaseResultKeyRef = useRef<string | null>(null);
	const shownWinnerKeyRef = useRef<string | null>(null);
	const latestPhaseResultsRef = useRef<PhaseResultsView | null>(null);
	const gameStateRef = useRef<GameStateData | null>(null);
	const requestedGameStateCodeRef = useRef<string | null>(null);
	const pendingActionRef = useRef(false);
	const pendingActionTypeRef = useRef<PlayerActionName | null>(null);
	const gameFinishedRef = useRef(false);

	const phaseKey = gameState ? `${gameState.dayNumber}-${gameState.currentPhase}` : "";

	// Popup close helpers used across effects and websocket handlers
	const closeSelectionPopup = useCallback(() => {
		if (selectionPopupIdRef.current) {
			closePopup(selectionPopupIdRef.current);
			selectionPopupIdRef.current = null;
		}
	}, [closePopup]);

	const closeRoleRevealPopup = useCallback(() => {
		if (roleRevealPopupIdRef.current) {
			closePopup(roleRevealPopupIdRef.current);
			roleRevealPopupIdRef.current = null;
		}
	}, [closePopup]);

	const closePhaseResultsPopup = useCallback(() => {
		if (phaseResultsPopupIdRef.current) {
			closePopup(phaseResultsPopupIdRef.current);
			phaseResultsPopupIdRef.current = null;
		}
	}, [closePopup]);

	const closeActionLoadingPopup = useCallback(() => {
		if (actionLoadingPopupIdRef.current) {
			closePopup(actionLoadingPopupIdRef.current);
			actionLoadingPopupIdRef.current = null;
		}
	}, [closePopup]);

	const showActionLoadingPopup = useCallback(() => {
		closeActionLoadingPopup();
		actionLoadingPopupIdRef.current = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {}
		});
	}, [closeActionLoadingPopup, showPopup, t]);

	const getPlayerName = useCallback((playerId: number | null | undefined) => {
		if (playerId === null || playerId === undefined) return t("pages.game.actions.skipAction");

		const state = gameStateRef.current;
		const player = state?.players.find((entry) => entry.playerId === playerId);
		return player?.username ?? t("pages.game.players.unknown", { playerId: String(playerId) });
	}, [t]);

	const getPhaseDisplayName = useCallback((phase: Phase) => {
		return t(`pages.game.phases.${phase}`);
	}, [t]);

	const getRoleDisplayName = useCallback((roleKey: string) => {
		return t(`roles.keys.${roleKey}`);
	}, [t]);

	// Human-readable summaries for phase and personal outcomes
	const describePhaseResults = useCallback((data: PhaseResultsView, eliminatedRowsVisible = false) => {
		const eliminated = data.result.eliminated ?? [];
		const eliminatedNames = eliminated.map((entry) => getPlayerName(entry.playerId));

		if (data.resolvedPhase === "day") {
			return t("pages.game.results.dayEnded");
		}

		if (eliminatedRowsVisible && eliminated.length > 0) {
			return "";
		}

		if (data.resolvedPhase === "voting") {
			if (eliminated.length === 0) {
				return t("pages.game.results.votingNoElimination");
			}

			return t("pages.game.results.votingEliminated", { players: eliminatedNames.join(", ") });
		}

		if (eliminated.length === 0) {
			return t("pages.game.results.nightPeaceful");
		}

		return t("pages.game.results.nightEliminated", { players: eliminatedNames.join(", ") });
	}, [getPlayerName, t]);

	const describePersonalResult = useCallback((result: PersonalPhaseResult) => {
		switch (result.type) {
			case "eliminate":
				return t("pages.game.personal.eliminate", { player: getPlayerName(result.targetPlayerId) });
			case "convert":
				return t("pages.game.personal.convert", { player: getPlayerName(result.targetPlayerId) });
			case "inspect":
				return t("pages.game.personal.inspect", {
					player: getPlayerName(result.targetPlayerId),
					alignment: t(`pages.game.alignments.${result.alignment}`)
				});
			case "watch": {
				const visitors = result.visitorPlayerIds
					.filter((playerId) => playerId !== gameStateRef.current?.myPlayerId)
					.map((playerId) => getPlayerName(playerId));

				return visitors.length > 0
					? t("pages.game.personal.watchVisitors", { player: getPlayerName(result.targetPlayerId), visitors: visitors.join(", ") })
					: t("pages.game.personal.watchNone", { player: getPlayerName(result.targetPlayerId) });
			}
			case "jail":
				return result.applied
					? t("pages.game.personal.jailApplied", { player: getPlayerName(result.targetPlayerId) })
					: t("pages.game.personal.jailFailed", { player: getPlayerName(result.targetPlayerId) });
			case "jailed":
				return t("pages.game.personal.jailed");
			case "protect":
				return result.wasAttacked
					? t("pages.game.personal.protectSaved", { player: getPlayerName(result.targetPlayerId) })
					: t("pages.game.personal.protectQuiet", { player: getPlayerName(result.targetPlayerId) });
			case "guess":
				return result.correct
					? t("pages.game.personal.guessCorrect", { player: getPlayerName(result.targetPlayerId), role: getRoleDisplayName(result.roleKey) })
					: t("pages.game.personal.guessIncorrect", { player: getPlayerName(result.targetPlayerId), role: getRoleDisplayName(result.roleKey) });
			case "chronicler_to_guess":
				return t("pages.game.personal.chroniclerTarget", { role: getRoleDisplayName(result.roleKey) });
			case "converted":
				return t("pages.game.personal.converted");
		}
	}, [getPlayerName, getRoleDisplayName, t]);

	const showPhaseResultsPopup = useCallback((data: PhaseResultsView, personalResults: PersonalPhaseResult[] = []) => {
		closePhaseResultsPopup();

		const votesVisible = data.resolvedPhase === "voting" && data.result.votes !== undefined;
		const voteRows = (data.result.votes ?? []).map((vote) => ({
			voterName: vote.voterPlayerId === undefined
				? t("pages.game.results.anonymousVoter")
				: getPlayerName(vote.voterPlayerId),
			targetName: vote.targetPlayerId === null ? null : getPlayerName(vote.targetPlayerId)
		}));
		const personalLines = personalResults.map(describePersonalResult);
		const eliminated = data.result.eliminated ?? [];
		const eliminatedRows = eliminated.map((entry) => ({
			playerName: getPlayerName(entry.playerId),
			roleName: entry.roleKey ? getRoleDisplayName(entry.roleKey) : null
		}));
		const eliminatedRowsVisible = eliminatedRows.length > 0;
		const hasResultDetails = (votesVisible && voteRows.length > 0) || personalLines.length > 0 || eliminatedRows.length > 0;
		const baseHeight = hasResultDetails ? 220 : 180;
		const minimumHeight = hasResultDetails ? 260 : 220;
		const estimatedHeight =
			baseHeight +
			(votesVisible && voteRows.length > 0 ? 46 + voteRows.length * 38 : 0) +
			(personalLines.length > 0 ? 46 + personalLines.length * 38 : 0) +
			(eliminatedRows.length > 0 ? 46 + eliminatedRows.length * 42 : 0);
		const popupHeight = Math.max(minimumHeight, Math.min(window.innerHeight - 48, estimatedHeight));
		const popupWidth = voteRows.length > 0 || personalLines.length > 1 ? 560 : hasResultDetails ? 460 : 420;

		phaseResultsPopupIdRef.current = showPopup({
			type: "phaseResults",
			title: t("pages.game.results.phaseTitle", { phase: getPhaseDisplayName(data.resolvedPhase) }),
			payload: {
				dayNumber: data.dayNumber,
				resolvedPhase: data.resolvedPhase,
				summary: describePhaseResults(data, eliminatedRowsVisible),
				personal: personalLines,
				eliminated,
				eliminatedPlayerNames: eliminatedRows.map((entry) => entry.playerName),
				eliminatedRows,
				votes: data.result.votes,
				votesVisible,
				voteRows
			},
			autoCloseDelay: 15_000,
			position: "center",
			width: popupWidth,
			height: popupHeight
		});
	}, [closePhaseResultsPopup, describePersonalResult, describePhaseResults, getPhaseDisplayName, getPlayerName, getRoleDisplayName, showPopup, t]);

	const showGameFinishedPopup = useCallback((result: GameFinishedResult) => {
		closeSelectionPopup();
		closeRoleRevealPopup();
		closePhaseResultsPopup();
		closeActionLoadingPopup();

		const key = `${result.winner}-${result.winnerPlayerIds.join(".")}`;
		if (shownWinnerKeyRef.current === key) return;
		shownWinnerKeyRef.current = key;

		gameFinishedRef.current = true;

		const currentState = gameStateRef.current;
		const playerNames = result.players.reduce((acc, player) => {
			acc[player.playerId] = player.username;
			return acc;
		}, {} as Record<number, string>);

		for (const player of currentState?.players ?? []) {
			playerNames[player.playerId] = player.username;
		}

		const gameFinished: GameFinishedPopupPayload = {
			...result,
			dayNumber: currentState?.dayNumber,
			playerNames
		};

		navigate("/home", { replace: true, state: { gameFinished } });
	}, [closeActionLoadingPopup, closePhaseResultsPopup, closeRoleRevealPopup, closeSelectionPopup, navigate]);

	// Keep refs and global cleanup in sync with component lifecycle
	useEffect(() => {
		mountedRef.current = true;
		const chatTooltipTimers = chatTooltipTimersRef.current;

		return () => {
			mountedRef.current = false;
			closeSelectionPopup();
			closeRoleRevealPopup();
			closePhaseResultsPopup();
			closeActionLoadingPopup();

			for (const timerId of chatTooltipTimers.values()) {
				window.clearTimeout(timerId);
			}
			chatTooltipTimers.clear();
		};
	}, [closeActionLoadingPopup, closePhaseResultsPopup, closeRoleRevealPopup, closeSelectionPopup]);

	useEffect(() => {
		gameStateRef.current = gameState;
	}, [gameState]);

	// Match dynamic app theme to current phase (day/night)
	useEffect(() => {
		if (theme !== "dynamic") {
			setDynamicTheme(null);
			return;
		}

		setDynamicTheme(gameState?.currentPhase === "night" ? "dark" : "light");

		return () => {
			setDynamicTheme(null);
		};
	}, [gameState?.currentPhase, setDynamicTheme, theme]);

	// Main websocket listener for in-game updates and actions
	useEffect(() => {
		const unsubscribe = subscribe((msg) => {
			switch (msg.type) {
				case "ERROR":
					if (
						msg.code === ErrorCode.PLAYER_NOT_IN_LOBBY ||
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.GAME_NOT_IN_LOBBY
					) {
						return;
					}

					if (msg.code === ErrorCode.INVALID_REQUEST || msg.code === ErrorCode.INVALID_ACTION) {
						closeSelectionPopup();
						closeActionLoadingPopup();
						pendingActionRef.current = false;
						pendingActionTypeRef.current = null;
						showPopup({
							type: "error",
							title: t("common.error"),
							payload: { message: t("pages.game.actions.unavailable") },
							autoCloseDelay: 4000
						});
					}
					break;

				case "GAME_STATE":
					if (!mountedRef.current) return;
					if (msg.data.gameCode !== gameCode) return;

					if (gameStateRef.current) {
						const previousPhaseKey = `${gameStateRef.current.dayNumber}-${gameStateRef.current.currentPhase}`;
						const nextPhaseKey = `${msg.data.dayNumber}-${msg.data.currentPhase}`;

						if (previousPhaseKey !== nextPhaseKey) {
							closeSelectionPopup();
							closeActionLoadingPopup();
							pendingActionRef.current = false;
							pendingActionTypeRef.current = null;
							setSubmittedActionPhaseKey(null);
						}
					}

					gameStateRef.current = msg.data;
					setGameState(msg.data);
					break;

				case "PHASE_RESULTS": {
					const view: PhaseResultsView = {
						dayNumber: msg.dayNumber,
						resolvedPhase: msg.resolvedPhase,
						result: msg.result
					};
					const key = `${view.dayNumber}-${view.resolvedPhase}`;

					latestPhaseResultsRef.current = view;
					if (shownPhaseResultKeyRef.current !== key) {
						shownPhaseResultKeyRef.current = key;
						showPhaseResultsPopup(view);
					}

					if (!gameFinishedRef.current) {
						sendMessage({ type: "REQUEST_GAME_STATE" });
					}
					break;
				}

				case "PERSONAL_PHASE_RESULTS": {
					const currentPhaseResults = latestPhaseResultsRef.current;

					if (
						currentPhaseResults &&
						currentPhaseResults.dayNumber === msg.dayNumber &&
						currentPhaseResults.resolvedPhase === msg.resolvedPhase
					) {
						showPhaseResultsPopup(currentPhaseResults, msg.result);
					} else if (msg.result.length > 0) {
						showPopup({
							type: "info",
							title: t("pages.game.results.personalTitle", { phase: getPhaseDisplayName(msg.resolvedPhase) }),
							payload: { message: msg.result.map(describePersonalResult).join(" ") },
							autoCloseDelay: 8000
						});
					}

					if (!gameFinishedRef.current) {
						sendMessage({ type: "REQUEST_GAME_STATE" });
					}
					break;
				}

				case "GAME_FINISHED":
					gameFinishedRef.current = true;
					showGameFinishedPopup(msg.result);
					break;

				case "PLAYER_ACTION_OK":
					closeSelectionPopup();
					closeActionLoadingPopup();
					if (pendingActionRef.current) {
						setSubmittedActionPhaseKey(pendingActionTypeRef.current === "skip" ? null : phaseKey);
						pendingActionRef.current = false;
						pendingActionTypeRef.current = null;
					}
					break;

				case "GAME_CHAT_MESSAGE":
					if (msg.data.playerId !== null) {
						const playerId = msg.data.playerId;
						setChatTooltipMessages((prev) => ({ ...prev, [playerId]: msg.data.message }));
						setVisibleChatTooltips((prev) => ({ ...prev, [playerId]: true }));

						const existingTimer = chatTooltipTimersRef.current.get(playerId);
						if (existingTimer !== undefined) {
							window.clearTimeout(existingTimer);
						}

						const timerId = window.setTimeout(() => {
							setVisibleChatTooltips((prev) => {
								const next = { ...prev };
								delete next[playerId];
								return next;
							});
							chatTooltipTimersRef.current.delete(playerId);
						}, 5000);

						chatTooltipTimersRef.current.set(playerId, timerId);
					}
					break;
			}
		});

		return unsubscribe;
	}, [closeActionLoadingPopup, closeSelectionPopup, describePersonalResult, gameCode, getPhaseDisplayName, navigate, phaseKey, sendMessage, showGameFinishedPopup, showPhaseResultsPopup, showPopup, subscribe, t]);

	// Request game state on entry and retry until state is received
	useEffect(() => {
		if (!gameCode) {
			requestedGameStateCodeRef.current = null;
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("pages.game.gameNotFound") },
				autoCloseDelay: 5000
			});
			navigate("/home", { replace: true });
			return;
		}

		if (requestedGameStateCodeRef.current !== gameCode) {
			requestedGameStateCodeRef.current = gameCode;
			gameFinishedRef.current = false;
			sendMessage({ type: "REQUEST_GAME_STATE" });
		}

		const retry = window.setInterval(() => {
			if (gameStateRef.current || gameFinishedRef.current) {
				window.clearInterval(retry);
				return;
			}

			sendMessage({ type: "REQUEST_GAME_STATE" });
		}, 1500);

		return () => window.clearInterval(retry);
	}, [gameCode, navigate, sendMessage, showPopup, t]);

	// Show role reveal once per role assignment
	useEffect(() => {
		if (!gameState) return;

		const role = roles.find((entry) => entry.key === gameState.myRoleKey);
		const revealKey = `${gameState.gameId}-${gameState.myPlayerId}-${gameState.myRoleKey}`;
		if (shownRoleRevealKeyRef.current === revealKey) return;

		shownRoleRevealKeyRef.current = revealKey;
		roleRevealPopupIdRef.current = showPopup({
			type: "roleReveal",
			title: t("pages.game.roleReveal"),
			payload: {
				roleKey: gameState.myRoleKey,
				roleName: getRoleDisplayName(gameState.myRoleKey),
				roleAlignment: role?.alignment ?? ""
			},
			position: "center",
			width: 400,
			height: 250
		});
	}, [gameState, getRoleDisplayName, roles, showPopup, t]);

	// Phase timer tick based on server-provided phase end timestamp
	useEffect(() => {
		if (!gameState?.phaseEndsAt) return;

		const updatePhaseTimer = () => {
			setPhaseTimeRemaining(Math.max(0, gameState.phaseEndsAt - Date.now()));
		};

		updatePhaseTimer();
		const interval = window.setInterval(updatePhaseTimer, 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [gameState]);

	// Derived player collections for action logic and circular layout
	const myPlayer = useMemo(() => {
		if (!gameState) return null;
		return gameState.players.find((player) => player.playerId === gameState.myPlayerId) ?? null;
	}, [gameState]);

	const isAlive = Boolean(myPlayer && !myPlayer.isEliminated);

	const aliveTargets = useMemo(() => {
		if (!gameState) return [];

		return gameState.players.filter((player) => {
			if (player.isEliminated) return false;
			if (gameState.currentPhase !== "voting" && player.playerId === gameState.myPlayerId) return false;
			if (gameState.currentPhase === "night" && player.isKnownAlly) return false;
			return true;
		});
	}, [gameState]);

	const playerPositions = useMemo(() => {
		if (!gameState || gameState.players.length === 0) return [];

		const players = [...gameState.players].sort((a, b) => a.seatNr - b.seatNr);
		const radiusX = players.length > 8 ? 43 : players.length > 6 ? 40 : 36;
		const radiusY = players.length > 8 ? 28 : players.length > 6 ? 27 : 25;
		const edgeX = players.length > 8 ? 9 : 12;
		const edgeY = players.length > 8 ? 21 : 23;

		return players.map((player, index) => {
			const angle = ((index / players.length) * 2 * Math.PI) - (Math.PI / 2);
			const x = Math.min(100 - edgeX, Math.max(edgeX, 50 + radiusX * Math.cos(angle)));
			const y = Math.min(100 - edgeY, Math.max(edgeY, 50 + radiusY * Math.sin(angle)));

			return { ...player, x, y };
		});
	}, [gameState]);

	// Resolve available actions from current phase and role
	const getActionConfigs = useCallback((): ActionConfig[] => {
		if (!gameState || !isAlive) return [];
		if (gameState.myIsJailed) return [];

		return gameState.availableActions
			.filter((actionType): actionType is Exclude<PlayerActionName, "skip"> => actionType !== "skip")
			.map((actionType) => ({
				actionType,
				label: t(`pages.game.actionNames.${actionType}`)
			}));
	}, [gameState, isAlive, t]);

	// Action handlers for skip and target selection flows
	const submitSkip = () => {
		if (!gameState || gameState.currentPhase === "day") return;
		if (!gameState.availableActions.includes("skip")) return;

		sendMessage({ type: "PLAYER_ACTION", action: "skip", targetPlayerId: null });
		pendingActionRef.current = true;
		pendingActionTypeRef.current = "skip";
		setSubmittedActionPhaseKey(null);
		showActionLoadingPopup();
	};

	const submitTargetAction = useCallback((actionType: Exclude<PlayerActionName, "skip">, targetPlayerId: number) => {
		if (!gameState || gameState.currentPhase === "day") return;
		if (!gameState.availableActions.includes(actionType)) return;

		sendMessage({ type: "PLAYER_ACTION", action: actionType, targetPlayerId });
		pendingActionRef.current = true;
		pendingActionTypeRef.current = actionType;
		setSubmittedActionPhaseKey(null);
		showActionLoadingPopup();
	}, [gameState, sendMessage, showActionLoadingPopup]);

	const openSelectionPopup = useCallback((actionConfigs: ActionConfig[]) => {
		if (!gameState || !isAlive) return;
		if (actionConfigs.length === 0) return;

		const players = aliveTargets.map((player) => ({
			playerId: player.playerId,
			username: player.username,
			iconSrc: player.type === "bot" ? defaultBotIcon : playerIcons[player.playerId] ?? defaultIcon
		}));

		selectionPopupIdRef.current = showPopup({
			type: "playerSelection",
			title: gameState.currentPhase === "voting" ? t("pages.game.actions.vote") : t("pages.game.actions.action"),
			payload: {
				actionType: actionConfigs[0].actionType,
				actionLabel: actionConfigs[0].label,
				actions: actionConfigs,
				players,
				onSubmit: submitTargetAction
			},
			width: 750,
			height: 550,
			position: "center"
		});

	}, [aliveTargets, gameState, isAlive, playerIcons, showPopup, submitTargetAction, t]);

	const formatTimeRemaining = (ms: number) => {
		const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	};

	// Primary action panel content per phase/state
	const renderActionBlock = () => {
		if (!gameState) return null;

		const actionConfigs = getActionConfigs();
		const hasSubmittedAction = submittedActionPhaseKey === phaseKey;
		const actionButtonLabel = gameState.currentPhase === "voting" ? t("pages.game.actions.vote") : t("pages.game.actions.action");

		return (
			<div className="action-panel">
				<h3>{getPhaseDisplayName(gameState.currentPhase)} {gameState.dayNumber}</h3>

				{!isAlive ? (
					<p>{t("pages.game.actions.eliminatedPrompt")}</p>
				) : gameState.myIsJailed ? (
					<p>{t("pages.game.actions.jailedPrompt")}</p>
				) : gameState.currentPhase === "day" ? (
					<p>{t("pages.game.actions.discussWithPlayers")}</p>
				) : actionConfigs.length === 0 ? (
					<p>{t("pages.game.actions.noSpecialActions")}</p>
				) : (
					<>
						<p>{gameState.currentPhase === "voting" ? t("pages.game.actions.votingPrompt") : t("pages.game.actions.nightPrompt")}</p>
						<div className="action-button-row">
							<button
								type="button"
								className="custom-button game-action-button"
								onClick={() => openSelectionPopup(actionConfigs)}
							>
								{actionButtonLabel}
							</button>
							<button type="button" className="custom-button game-action-button" onClick={submitSkip}>
								{t("pages.game.actions.skipAction")}
							</button>
						</div>
						<p className="action-submitted">
							<CheckCircleIcon />
							{hasSubmittedAction
								? t("pages.game.actions.submitted")
								: t("pages.game.actions.currentlySkipping")}
						</p>
					</>
				)}
			</div>
		);
	};

	if (!gameState) {
		return (
			<div className="game-page">
				<div className="loading">{t("common.loading")}</div>
			</div>
		);
	}

	return (
		<div className="game-page">
			<div className="game-container">
				<div className="action-block">
					{renderActionBlock()}
				</div>

				<div className="game-circle-container">
					{playerPositions.map((player) => (
						<div
							key={player.playerId}
							className={`game-player ${player.isEliminated ? "eliminated" : ""} ${player.playerId === gameState.myPlayerId ? "current-player" : ""}`}
							style={{
								left: `${player.x}%`,
								top: `${player.y}%`
							}}
						>
							<Tooltip
								content={chatTooltipMessages[player.playerId] ?? ""}
								position="top"
								showDelay={0}
								hideDelay={0}
								hoverEnabled={false}
								forceVisible={Boolean(visibleChatTooltips[player.playerId])}
								className="game-chat-tooltip"
							>
								<div className="player-icon-wrapper">
									<img
										className="player-icon"
										src={player.type === "bot" ? defaultBotIcon : playerIcons[player.playerId] ?? defaultIcon}
										alt={player.username}
									/>
									{player.isKnownAlly && !player.isEliminated && (
										<div className="known-ally-badge">V</div>
									)}
									{player.isEliminated && (
										<div className="eliminated-overlay">
											<XCircleIcon />
										</div>
									)}
								</div>
							</Tooltip>

						</div>
					))}

					{playerPositions.map((player) => (
						<span
							key={`${player.playerId}-label`}
							className={`player-name-game ${player.isEliminated ? "eliminated" : ""} ${player.playerId === gameState.myPlayerId ? "current-player" : ""}`}
							style={{
								left: `${player.x}%`,
								top: `${player.y}%`
							}}
						>
							{player.username}
						</span>
					))}
				</div>
			</div>

			<div className="time-remaining">
				<strong>{formatTimeRemaining(phaseTimeRemaining)}</strong>
			</div>
		</div>
	);
};

export default Game;
