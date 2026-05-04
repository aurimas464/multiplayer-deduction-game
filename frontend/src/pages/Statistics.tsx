import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { statisticsService } from "../services/statistics";
import { usePopup } from "../contexts/PopupContext";
import { useTranslation } from "../hooks/useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { errorMapper } from "../utils/errorMapper";
import type { ErrorCodeType } from "../types";
import type { StatisticsSnapshot } from "../types/statistics";
import "../css/statistics.css";

type StatisticsView = "public" | "personal";

type Metric = {
	label: string;
	value: string | number;
};

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

	const formatNumber = useCallback((value: number) => {
		return new Intl.NumberFormat().format(value);
	}, []);

	const formatDate = useCallback((value: number) => {
		if (!value) return t("pages.statistics.never");
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short"
		}).format(new Date(value));
	}, [t]);

	const labelOrFallback = useCallback((key: string, fallback: string) => {
		const translated = t(key);
		return translated === key ? fallback : translated;
	}, [t]);

	const formatRole = useCallback((roleKey: string) => {
		return labelOrFallback(`roles.keys.${roleKey}`, roleKey);
	}, [labelOrFallback]);

	const formatAction = useCallback((actionKey: string) => {
		return labelOrFallback(`pages.game.actionNames.${actionKey}`, actionKey);
	}, [labelOrFallback]);

	const formatSettingValue = useCallback((value: string | boolean) => {
		if (typeof value === "boolean") {
			return value ? t("common.on") : t("common.off");
		}

		const settingLabel = labelOrFallback(`pages.gameLobby.settings.dropdown.${value}`, value);
		if (settingLabel !== value) return settingLabel;

		return value
			.split("_")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(" ");
	}, [labelOrFallback, t]);

	const handleError = useCallback((code?: ErrorCodeType) => {
		showPopup({
			type: "error",
			title: t("common.error"),
			payload: { message: errorMapper(code ?? "UNKNOWN_ERROR", t, language) },
			autoCloseDelay: 5000
		});
	}, [language, showPopup, t]);

	const loadPublicStats = useCallback(async (refresh = false) => {
		if (refresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}
		const response = await statisticsService.getGameStats();
		if (refresh) {
			setRefreshing(false);
		} else {
			setLoading(false);
		}

		if (response.success) {
			setPublicStats(response.result ?? null);
			return;
		}

		handleError(response.errors[0]?.code);
	}, [handleError]);

	const loadPersonalStats = useCallback(async (refresh = false) => {
		if (refresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}
		const response = await statisticsService.getUserStats(refresh);
		if (refresh) {
			setRefreshing(false);
		} else {
			setLoading(false);
		}

		if (response.success) {
			setPersonalStats(response.result ?? null);
			return;
		}

		handleError(response.errors[0]?.code);
	}, [handleError]);

	useEffect(() => {
		const timer = setTimeout(() => {
			void loadPublicStats();
			void loadPersonalStats();
		}, 0);

		return () => {
			clearTimeout(timer);
		};
	}, [loadPersonalStats, loadPublicStats]);

	const totals = useMemo<Metric[]>(() => {
		if (!activeStats) return [];

		return [
			{ label: t("pages.statistics.metrics.games"), value: formatNumber(activeStats.totals.games) },
			{ label: t("pages.statistics.metrics.friendships"), value: formatNumber(activeStats.totals.friendships) },
			{ label: t("pages.statistics.metrics.directMessages"), value: formatNumber(activeStats.totals.directMessages) },
			{ label: t("pages.statistics.metrics.gameMessages"), value: formatNumber(activeStats.totals.gameMessages) },
			{ label: t("pages.statistics.metrics.actions"), value: formatNumber(activeStats.totals.actions) },
			{ label: t("pages.statistics.metrics.notes"), value: formatNumber(activeStats.totals.notes) }
		];
	}, [activeStats, formatNumber, t]);

	const gameMetrics = useMemo<Metric[]>(() => {
		if (!activeStats) return [];

		const totalResolved = activeStats.games.player.wins + activeStats.games.player.losses;
		const winRate = totalResolved > 0 ? Math.round((activeStats.games.player.wins / totalResolved) * 100) : 0;

		return [
			{ label: view === "public" ? t("pages.statistics.metrics.totalWins") : t("pages.statistics.metrics.wins"), value: formatNumber(activeStats.games.player.wins) },
			{ label: view === "public" ? t("pages.statistics.metrics.totalLosses") : t("pages.statistics.metrics.losses"), value: formatNumber(activeStats.games.player.losses) },
			{ label: t("pages.statistics.metrics.winRate"), value: `${winRate}%` },
			{ label: t("pages.statistics.metrics.aliveAtEnd"), value: formatNumber(activeStats.games.player.aliveAtEnd) },
			{ label: t("pages.statistics.metrics.deadAtEnd"), value: formatNumber(activeStats.games.player.deadAtEnd) }
		];
	}, [activeStats, formatNumber, t, view]);

	const averages = useMemo<Metric[]>(() => {
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

	const activity = useMemo<Metric[]>(() => {
		if (!activeStats) return [];

		return [
			{ label: t("pages.statistics.metrics.usersCreated"), value: formatNumber(activeStats.activity.last24h.usersCreated) },
			{ label: t("pages.statistics.metrics.gamesCreated"), value: formatNumber(activeStats.activity.last24h.gamesCreated) },
			{ label: t("pages.statistics.metrics.directMessagesSent"), value: formatNumber(activeStats.activity.last24h.directMessagesSent) },
			{ label: t("pages.statistics.metrics.gameMessagesSent"), value: formatNumber(activeStats.activity.last24h.gameMessagesSent) },
			{ label: t("pages.statistics.metrics.actionsSaved"), value: formatNumber(activeStats.activity.last24h.actionsSaved) }
		];
	}, [activeStats, formatNumber, t]);

	const renderMetricGrid = (items: Metric[]) => (
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
							<strong>{formatNumber(item.count)}</strong>
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
									t("pages.statistics.sections.victories"),
									activeStats.games.victories.map((item) => ({
										label: labelOrFallback(`pages.gameLobby.settings.alignments.${item.alignment}`, item.alignment),
										count: item.count
									}))
								)}
								{renderList(
									t("pages.statistics.sections.topRoles"),
									activeStats.games.topRoles.map((item) => ({ label: formatRole(item.roleKey), count: item.count }))
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
															<strong>{formatNumber(item.count)}</strong>
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
