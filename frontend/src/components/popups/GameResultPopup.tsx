import Popup from "./Popup";
import { TrophyIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";
import { useTranslation } from "../../hooks/useTranslation";
import { useRoles } from "../../hooks/useRoles";

type Props = {
	popup: PopupData<"gameFinished">;
	onClose: () => void;
};

const GameFinishedPopup = ({ popup, onClose }: Props) => {
	const { t } = useTranslation();
	const roles = useRoles();
	const winnerLabel =
		popup.payload.winner === "commune"
			? t("pages.gameLobby.settings.alignments.commune")
			: popup.payload.winner === "vampire"
				? t("pages.game.finished.vampires")
				: t("pages.gameLobby.settings.alignments.neutral");

	const getPlayerName = (playerId: number | null) => {
		if (playerId === null) return t("pages.game.actions.skipAction");
		return popup.payload.playerNames[playerId] ?? t("pages.game.players.unknown", { playerId: String(playerId) });
	};

	const getRoleName = (roleKey: string) => {
		const role = roles.find((entry) => entry.key === roleKey);
		return t(`roles.keys.${role?.key ?? roleKey}`);
	};
	const winnerNames = popup.payload.winnerPlayerIds.map(getPlayerName).filter(Boolean);

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 820}
			height={popup.height ?? 620}
			minimizable={false}
			closable={true}
			icon={<TrophyIcon />}
		>
			<div className="game-finished-popup-content">
				<div className="game-finished-summary">
					<p className="success-message">{t("pages.game.finished.winnerMessage", { winner: winnerLabel })}</p>
					{winnerNames.length > 0 && (
						<p className="info-message">{t("pages.game.finished.winners", { winners: winnerNames.join(", ") })}</p>
					)}
					{popup.payload.dayNumber !== undefined && (
						<p className="info-message">{t("pages.game.finished.endedOnDay", { day: String(popup.payload.dayNumber) })}</p>
					)}
				</div>

				<div className="game-finished-section">
					<h3>{t("pages.game.finished.finalRoles")}</h3>
					<table className="game-finished-table">
						<thead>
							<tr>
								<th>{t("pages.game.finished.columns.player")}</th>
								<th>{t("pages.game.finished.columns.role")}</th>
								<th>{t("pages.game.finished.columns.status")}</th>
							</tr>
						</thead>
						<tbody>
							{popup.payload.players.map((player) => (
								<tr key={player.playerId}>
									<td>{player.username}</td>
									<td>{getRoleName(player.roleKey)}</td>
									<td>{player.isEliminated ? t("pages.game.finished.status.eliminated") : t("pages.game.finished.status.alive")}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{popup.payload.timeline.length > 0 && (
					<div className="game-finished-section">
						<h3>{t("pages.game.finished.timeline")}</h3>
						<table className="game-finished-table">
							<thead>
								<tr>
									<th>{t("pages.game.finished.columns.day")}</th>
									<th>{t("pages.game.finished.columns.phase")}</th>
									<th>{t("pages.game.finished.columns.player")}</th>
									<th>{t("pages.game.finished.columns.action")}</th>
									<th>{t("pages.game.finished.columns.target")}</th>
								</tr>
							</thead>
							<tbody>
								{popup.payload.timeline.map((entry, index) => (
									<tr key={`${entry.dayNumber}-${entry.phase}-${entry.playerId}-${index}`}>
										<td>{entry.dayNumber}</td>
										<td>{t(`pages.game.phases.${entry.phase}`)}</td>
										<td>{getPlayerName(entry.playerId)}</td>
										<td>{t(`pages.game.actionNames.${entry.type}`)}</td>
										<td>{getPlayerName(entry.targetPlayerId)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</Popup>
	);
};

export default GameFinishedPopup;
