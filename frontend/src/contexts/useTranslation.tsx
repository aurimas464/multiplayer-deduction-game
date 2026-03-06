import { useCallback } from "react";
import type { Language } from "../types/settings";
import { translations } from "../locales";
import { useLanguage } from "./LanguageContext";

// Resolve nested translation from  translations object
const getNestedValue = (language_obj: any, path: string) => {
	const keys = path.split(".");
	let value = language_obj;

	for (const k of keys) {
		value = value?.[k];
		if (value === undefined) return undefined;
	}

	return value;
};

// Hook for using translations
export const useTranslation = () => {
	const { language } = useLanguage();

	/**
	 * Translates a given key
	 *
	 * @param key          Dot-separated translation key (e.g. "auth.login.title")
	 * @param params       Placeholder values (e.g. { name: "User" })
	 * @param langOverride Optional language override for one-off translations
	 */
	const t = useCallback(
		(key: string, params: Record<string, string> = {}, langOverride?: Language) => {
			const lang = langOverride ?? language;

			const raw = getNestedValue(translations?.[lang], key);

			if (typeof raw !== "string") return key;

			// Replace {param} placeholders in string values with actual values
			let result = raw;
			for (const [paramKey, val] of Object.entries(params)) {
				result = result.replaceAll(`{${paramKey}}`, String(val));
			}
			return result;
		}, [language]
	);

	return { t };
};
