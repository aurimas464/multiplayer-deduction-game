import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { languages, type Language } from "../types/settings";
import { useUser } from "./UserContext";

type LanguageContextType = {
	language: Language;
	setLanguage: (lang: Language) => void;
}

// Starts as undefined so that cases where app is used without context throws an error
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
	const { user } = useUser();
	const userId = user?.id ?? null;

	const [languagePreview, setLanguagePreview] = useState<{ userId: number | null; value: Language } | null>(null);
	const language = languagePreview?.userId === userId ? languagePreview.value : user?.language ?? languages[0];

	const setLanguage = useCallback((value: Language) => {
		setLanguagePreview({ userId, value });
	}, [userId]);

	// Exposed context value
	const value = useMemo(() => ({
		language,
		setLanguage,
	}), [language, setLanguage]);

	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

// Hook for accessing this context
export const useLanguage = () => {
	const context = useContext(LanguageContext);
	if (context === undefined) {
		throw new Error("No language context found!");
	}
	return context;
};
