import { useMemo, useState } from "react";
import Popup from "./Popup";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { PlayerActionType, type PlayerActionName } from "../../types/websocket";
import { useTranslation } from "../../hooks/useTranslation";

type Props = {
	popup: PopupData<"playerSelection">;
	onClose: () => void;
};

const PlayerSelectionPopup = ({ popup, onClose }: Props) => {
	const { actionType, actionLabel, actions, players } = popup.payload;
	const { sendMessage } = useWebSocket();
	const { t } = useTranslation();
	const selectableActions = useMemo(() => actions ?? [{ actionType, label: actionLabel }], [actionLabel, actionType, actions]);
	const [selectedActionType, setSelectedActionType] = useState<Exclude<PlayerActionName, "skip">>(selectableActions[0].actionType);
	const selectedAction = selectableActions.find((action) => action.actionType === selectedActionType) ?? selectableActions[0];

	const handlePlayerClick = (playerId: number) => {
		if (PlayerActionType.includes(selectedAction.actionType)) {
			sendMessage({
				type: "PLAYER_ACTION",
				action: selectedAction.actionType,
				targetPlayerId: playerId
			});
		} else {
			console.warn(t("pages.game.actions.invalidActionType", { action: selectedAction.actionType }));
		}
		onClose();
	};

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 500}
			height={popup.height ?? 600}
			autoCloseDelay={popup.autoCloseDelay}
			minimizable={false}
			closable={true}
			icon={<UserCircleIcon />}
		>
			<div className="player-selection-popup-content">
				<div className="selection-action-section">
					<span className="selection-label">{t("pages.game.actions.whatYouAreDoing")}</span>

					{selectableActions.length > 1 ? (
						<div className="player-action-toggle">
							{selectableActions.map((action) => (
								<button
									key={action.actionType}
									type="button"
									className={`custom-button player-action-toggle-button ${selectedActionType === action.actionType ? "active" : ""}`}
									onClick={() => setSelectedActionType(action.actionType)}
								>
									{action.label}
								</button>
							))}
						</div>
					) : (
						<span className="selection-action-label">{selectedAction.label}</span>
					)}
				</div>

				<div className="selection-target-header">
					<span className="selection-label">{t("pages.game.actions.targetablePlayers")}</span>
				</div>

				{players.length === 0 ? (
					<p className="selection-empty">{t("pages.game.actions.noTargets")}</p>
				) : (
					<div className="player-selection-grid">
						{players.map((player) => (
							<button
								key={player.playerId}
								type="button"
								className="player-selection-card"
								onClick={() => handlePlayerClick(player.playerId)}
							>
								<div className="player-selection-icon-wrapper">
									<img
										className="player-selection-icon"
										src={player.iconSrc}
										alt={player.username}
									/>
								</div>

								<span className="player-selection-name">{player.username}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</Popup>
	);
};

export default PlayerSelectionPopup;
