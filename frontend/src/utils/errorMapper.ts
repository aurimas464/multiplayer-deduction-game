import { ErrorCode } from "../types";
import type { useTranslation } from "../contexts/useTranslation";
import type { Language } from "../types/settings";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

function resolve(t: TranslateFn, key: string, language: Language, params?: Record<string, string>) {
	const msg = t(key, params ?? {}, language);
	return msg === key ? undefined : msg;
}

export function errorMapper(code: ErrorCode, t: TranslateFn, language: Language, fieldName?: string): string {

	if (fieldName) {
		const specificKey = `errors.specific.${String(code)}`;
		const specific = resolve(t, specificKey, language, { field: fieldName });
		if (specific) return specific;
	}

	const genericKey = `errors.generic.${String(code)}`;
	const generic = resolve(t, genericKey, language);
	if (generic) return generic;

	return t(`errors.generic.${String(ErrorCode.UNKNOWN_ERROR)}`, {}, language);
}
