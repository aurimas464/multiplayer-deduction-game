import { useEffect, useState } from "react";
import { cacheGet, cacheSet } from "../utils/localForage";
import { userService } from "../services/user";
import { errorMapper } from "../utils/errorMapper";
import { useTranslation } from "./useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { usePopup } from "../contexts/PopupContext";

export const usePlayerIcons = (playerEtags?: Record<number, string>) => {
	const { t } = useTranslation();
	const { language } = useLanguage();
	const { showPopup } = usePopup();
	const [playerIcons, setPlayerIcons] = useState<Record<number, string>>({});

	useEffect(() => {
		let cancelled = false;

		const syncIcons = async () => {
			if (!playerEtags) return;

			const nextIcons: Record<number, string> = {};
			const idsToFetch: number[] = [];

			for (const [playerIdStr, serverEtag] of Object.entries(playerEtags)) {
				const playerId = Number(playerIdStr);
				if (serverEtag == "") continue;

				const cacheKey = `player-icon-${playerId}`;
				const cached = await cacheGet<string>(cacheKey);
				const cachedEtag = cached?.etag;

				if (cached?.value && cachedEtag === serverEtag) {
					nextIcons[playerId] = cached.value;
				} else {
					idsToFetch.push(playerId);
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
					const etag = playerEtags[playerId];
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
					autoCloseDelay: 5000,
				});
			}
		};

		syncIcons().catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [playerEtags, language, showPopup, t]);

	return playerIcons;
};
