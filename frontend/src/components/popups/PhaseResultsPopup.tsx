import Popup from "./Popup";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";
import { useTranslation } from "../../hooks/useTranslation";

type Props = {
	popup: PopupData<"phaseResults">;
	onClose: () => void;
};

const PhaseResultsPopup = ({ popup, onClose }: Props) => {
	const { t } = useTranslation();
	const { summary, personal, eliminatedRows, votesVisible, voteRows } = popup.payload;

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 520}
			height={popup.height ?? 560}
			autoCloseDelay={popup.autoCloseDelay}
			minimizable={false}
			closable={true}
			icon={<ClipboardDocumentCheckIcon />}
		>
			<div className="phase-results-popup-content">
				{summary && (
					<p className="phase-results-summary">{summary}</p>
				)}

				{eliminatedRows.length > 0 && (
					<div className="phase-results-section">
						<h4>{t("pages.game.results.eliminated")}</h4>

						<ul className="phase-results-eliminated-list">
							{eliminatedRows.map((entry) => (
								<li key={`${entry.playerName}-${entry.roleName ?? "hidden"}`} className="phase-results-eliminated-row">
									<span className="phase-results-eliminated-name">{entry.playerName}</span>
									{entry.roleName && (
										<span className="phase-results-eliminated-role">{entry.roleName}</span>
									)}
								</li>
							))}
						</ul>
					</div>
				)}

				{votesVisible && voteRows.length > 0 && (
					<div className="phase-results-section">
						<h4>{t("pages.game.results.votes")}</h4>

						<ul className="phase-results-vote-list">
							{voteRows.map((vote, index) => (
								<li key={`${index}-${vote.voterName}-${vote.targetName ?? "skip"}`} className="phase-results-vote-row">
									<span className="phase-results-voter">{vote.voterName}</span>
									<span className="phase-results-vote-action">
										{vote.targetName === null
											? t("pages.game.results.voteSkipped")
											: t("pages.game.results.voteTarget", { target: vote.targetName })}
									</span>
								</li>
							))}
						</ul>
					</div>
				)}

				{personal.length > 0 && (
					<div className="phase-results-section">
						<h4>{t("pages.game.results.personal")}</h4>

						<ul className="phase-results-personal-list">
							{personal.map((line, idx) => (
								<li key={`${idx}-${line}`}>
									{line}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</Popup>
	);
};

export default PhaseResultsPopup;
