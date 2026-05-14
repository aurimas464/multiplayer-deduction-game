import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { statisticsService } from "../services/statistics";
import { usePopup } from "../contexts/PopupContext";
import { useTranslation } from "../hooks/useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { errorMapper } from "../utils/errorMapper";
import type { StatisticsSnapshot, StatisticsView } from "../types/statistics";
import "../css/statistics.css";

const Statistics = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { language } = useLanguage();
	const { showPopup } = usePopup();

	const [view, setView] = useState<StatisticsView>("public");
	
	const [publicStats, setPublicStats] = useState<StatisticsSnapshot | null>(null);
	const [personalStats, setPersonalStats] = useState<StatisticsSnapshot | null>(null);
	
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const activeStats = view === "public" ? publicStats : personalStats;

	// Format helpers
	const formatDate = useCallback((value: number) => {
		if (!value) return t("pages.statistics.never");
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return t("pages.statistics.never");
		const datePart = date.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
		const timePart = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
		return `${datePart} ${timePart}`;
	}, [t]);
	const formatRole = useCallback((roleKey: string) => {
		const key = `roles.keys.${roleKey}`;
		const translated = t(key);
		return translated === key ? roleKey : translated;
	}, [t]);
	const formatAction = useCallback((actionKey: string) => {
		const key = `pages.game.actionNames.${actionKey}`;
		const translated = t(key);
		return translated === key ? actionKey : translated;
	}, [t]);
	const formatAlignment = useCallback((alignment: string) => {
		const key = `pages.gameLobby.settings.alignments.${alignment}`;
		const translated = t(key);
		return translated === key ? alignment : translated;
	}, [t]);
	const formatSettingValue = useCallback((value: string | boolean) => {
		if (typeof value === "boolean") {
			return value ? t("common.on") : t("common.off");
		}

		const key = `pages.gameLobby.settings.dropdown.${value}`;
		const settingLabel = t(key);
		if (settingLabel !== key) return settingLabel;

		return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
	}, [t]);

	// Load public statistics
	const loadPublicStats = useCallback(async (refresh = false) => {
		if (refresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			const response = await statisticsService.getGameStats();

			if (response.success) {
				setPublicStats(response.result ?? null);
				return;
			}

			const errorMessage = errorMapper(response.errors[0]?.code ?? "UNKNOWN_ERROR", t, language);
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: errorMessage },
				autoCloseDelay: 5000
			});
		} finally {
			if (refresh) {
				setRefreshing(false);
			} else {
				setLoading(false);
			}
		}
	}, [language, showPopup, t]);

	// Load personal statistics
	const loadPersonalStats = useCallback(async (refresh = false) => {
		if (refresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			const response = await statisticsService.getUserStats(refresh);

			if (response.success) {
				setPersonalStats(response.result ?? null);
				return;
			}

			const errorMessage = errorMapper(response.errors[0]?.code ?? "UNKNOWN_ERROR", t, language);
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: errorMessage },
				autoCloseDelay: 5000
			});
		} finally {
			if (refresh) {
				setRefreshing(false);
			} else {
				setLoading(false);
			}
		}
	}, [language, showPopup, t]);

	// On mount, load statistics for both public and personal, since catched low effort requests
	useEffect(() => {
		const timer = setTimeout(() => {
			void loadPublicStats();
			void loadPersonalStats();
		}, 0);

		return () => {
			clearTimeout(timer);
		};
	}, [loadPersonalStats, loadPublicStats]);

	// Calculate totals, metrics, averages and activity with memoization, also assign labels
	const totals = useMemo<Array<{ label: string; value: string | number }>>(() => {
		if (!activeStats) return [];

		return [
			{ label: t("pages.statistics.metrics.games"), value: String(activeStats.totals.games) },
			{ label: t("pages.statistics.metrics.friendships"), value: String(activeStats.totals.friendships) },
			{ label: t("pages.statistics.metrics.directMessages"), value: String(activeStats.totals.directMessages) },
			{ label: t("pages.statistics.metrics.gameMessages"), value: String(activeStats.totals.gameMessages) },
			{ label: t("pages.statistics.metrics.actions"), value: String(activeStats.totals.actions) },
			{ label: t("pages.statistics.metrics.notes"), value: String(activeStats.totals.notes) }
		];
	}, [activeStats, t]);
	const gameMetrics = useMemo<Array<{ label: string; value: string | number }>>(() => {
		if (!activeStats) return [];

		const totalResolved = activeStats.games.player.wins + activeStats.games.player.losses;
		const winRate = totalResolved > 0 ? Math.round((activeStats.games.player.wins / totalResolved) * 100) : 0;

		return [
			{ label: view === "public" ? t("pages.statistics.metrics.totalWins") : t("pages.statistics.metrics.wins"), value: String(activeStats.games.player.wins) },
			{ label: view === "public" ? t("pages.statistics.metrics.totalLosses") : t("pages.statistics.metrics.losses"), value: String(activeStats.games.player.losses) },
			{ label: t("pages.statistics.metrics.winRate"), value: `${winRate}%` },
			{ label: t("pages.statistics.metrics.aliveAtEnd"), value: String(activeStats.games.player.aliveAtEnd) },
			{ label: t("pages.statistics.metrics.deadAtEnd"), value: String(activeStats.games.player.deadAtEnd) }
		];
	}, [activeStats, t, view]);
	const averages = useMemo<Array<{ label: string; value: string | number }>>(() => {
		if (!activeStats) return [];

		return [
			{ label: t("pages.statistics.metrics.participantsPerGame"), value: activeStats.games.averages.participantsPerGame },
			{ label: t("pages.statistics.metrics.actionsPerGame"), value: activeStats.games.averages.actionsPerGame },
			{ label: t("pages.statistics.metrics.gameMessagesPerGame"), value: activeStats.games.averages.gameMessagesPerGame },
			{ label: t("pages.statistics.metrics.directMessagesPerChat"), value: activeStats.games.averages.directMessagesPerChat },
			{ label: t("pages.statistics.metrics.alivePlayersPerFinishedGame"), value: activeStats.games.averages.alivePlayersPerFinishedGame },
			{ label: t("pages.statistics.metrics.deadPlayersPerFinishedGame"), value: activeStats.games.averages.deadPlayersPerFinishedGame },
			{ label: t("pages.statistics.metrics.daySeconds"), value: `${activeStats.games.averages.durationSeconds.day}s` },
			{ label: t("pages.statistics.metrics.votingSeconds"), value: `${activeStats.games.averages.durationSeconds.voting}s` },
			{ label: t("pages.statistics.metrics.nightSeconds"), value: `${activeStats.games.averages.durationSeconds.night}s` }
		];
	}, [activeStats, t]);
	const activity = useMemo<Array<{ label: string; value: string | number }>>(() => {
		if (!activeStats) return [];

		return [
			{ label: t("pages.statistics.metrics.usersCreated"), value: String(activeStats.activity.last24h.usersCreated) },
			{ label: t("pages.statistics.metrics.gamesCreated"), value: String(activeStats.activity.last24h.gamesCreated) },
			{ label: t("pages.statistics.metrics.directMessagesSent"), value: String(activeStats.activity.last24h.directMessagesSent) },
			{ label: t("pages.statistics.metrics.gameMessagesSent"), value: String(activeStats.activity.last24h.gameMessagesSent) },
			{ label: t("pages.statistics.metrics.actionsSaved"), value: String(activeStats.activity.last24h.actionsSaved) }
		];
	}, [activeStats, t]);

	// Reusable components for rendering
	const renderMetricGrid = (items: Array<{ label: string; value: string | number }>) => (
		<div className="statistics-metric-grid">
			{items.map((item) => (
				<div className="statistics-metric-card" key={item.label}>
					<span className="statistics-metric-label">{item.label}</span>
					<strong>{item.value}</strong>
				</div>
			))}
		</div>
	);
	const renderList = (title: string, items: Array<{ label: string; count: number }>) => (
		<div className="statistics-list-panel">
			<h3>{title}</h3>

			{items.length === 0 ? (
				<p className="statistics-empty">{t("pages.statistics.noData")}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={`${title}-${item.label}`}>
							<span>{item.label}</span>
							<strong>{String(item.count)}</strong>
						</li>
					))}
				</ul>
			)}
		</div>
	);

	return (
		<div className="statistics-page">
			<div className="statistics-container lobby-box">
				<div className="lobby-box-header">
					<div className="statistics-header-container">
						<div className="statistics-header-actions statistics-header-left">
							<button
								type="button"
								className="custom-button statistics-toolbar-button"
								onClick={() => navigate("/home")}
							>
								<ArrowLeftIcon />
								{t("common.back")}
							</button>

							{view === "personal" && (
								<button
									type="button"
									className="custom-button statistics-toolbar-button"
									onClick={() => void loadPersonalStats(true)}
									disabled={refreshing}
								>
									<ArrowPathIcon />
									{refreshing ? t("common.loading") : t("pages.statistics.refresh")}
								</button>
							)}
						</div>

						<h1>{t("pages.statistics.title")}</h1>

						<div className="statistics-tabs" role="tablist" aria-label={t("pages.statistics.title")}>
							<button
								type="button"
								className={`custom-button statistics-tab ${view === "public" ? "active" : ""}`}
								onClick={() => setView("public")}
							>
								{t("pages.statistics.public")}
							</button>
							<button
								type="button"
								className={`custom-button statistics-tab ${view === "personal" ? "active" : ""}`}
								onClick={() => setView("personal")}
							>
								{t("pages.statistics.personal")}
							</button>
						</div>
					</div>
				</div>

				<div className="statistics-content">
					{loading && !activeStats ? (
						<div className="statistics-loading">{t("common.loading")}</div>
					) : !activeStats ? (
						<div className="statistics-loading">{t("pages.statistics.noData")}</div>
					) : (
						<>
							<div className="statistics-updated">
								<span>{t("pages.statistics.updatedAt", { date: formatDate(activeStats.updatedAt) })}</span>
								{view === "personal" && (
									<span>{t("pages.statistics.lastRefresh", { date: formatDate(activeStats.lastManualRefresh) })}</span>
								)}
							</div>

							<section className="statistics-section">
								<h2>{t("pages.statistics.sections.totals")}</h2>
								{renderMetricGrid(totals)}
							</section>

							<section className="statistics-section">
								<h2>{view === "public" ? t("pages.statistics.sections.publicResults") : t("pages.statistics.sections.personalResults")}</h2>
								{renderMetricGrid(gameMetrics)}
							</section>

							<section className="statistics-section">
								<h2>{t("pages.statistics.sections.averages")}</h2>
								{renderMetricGrid(averages)}
							</section>

							<section className="statistics-section">
								<h2>{t("pages.statistics.sections.activity")}</h2>
								{renderMetricGrid(activity)}
							</section>

							<section className="statistics-lists">
								{renderList(
									t("pages.statistics.sections.topRoles"),
									activeStats.games.topRoles.map((item) => ({ label: formatRole(item.roleKey), count: item.count }))
								)}
								{renderList(
									t("pages.statistics.sections.victories"),
									activeStats.games.victories.map((item) => ({
										label: formatAlignment(item.alignment),
										count: item.count
									}))
								)}
								{renderList(
									t("pages.statistics.sections.topActions"),
									activeStats.games.topActions.map((item) => ({ label: formatAction(item.actionKey), count: item.count }))
								)}
							</section>

							<section className="statistics-section">
								<h2>{t("pages.statistics.sections.settings")}</h2>
								<div className="statistics-settings-grid">
									{Object.entries(activeStats.games.popularGameSettings).map(([key, values]) => (
										<div className="statistics-list-panel" key={key}>
											<h3>{t(`pages.statistics.settings.${key}`)}</h3>

											{values.length === 0 ? (
												<p className="statistics-empty">{t("pages.statistics.noData")}</p>
											) : (
												<ul>
													{values.map((item) => (
														<li key={`${key}-${String(item.value)}`}>
															<span>{formatSettingValue(item.value)}</span>
															<strong>{String(item.count)}</strong>
														</li>
													))}
												</ul>
											)}
										</div>
									))}
								</div>
							</section>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default Statistics;
