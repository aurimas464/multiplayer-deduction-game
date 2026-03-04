import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { languages, type Language } from '../types/settings';
import { useUser } from './UserContext';

type LanguageContextType = {
	language: Language;
	setLanguage: (lang: Language) => void;
}

// Starts as undefined so that cases where app is used without context throws an error
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
	const { user } = useUser();

	// Initialize language from user (or default)
	const [language, setLanguage] = useState<Language>(() => {
		return user?.language ?? languages[0];
	});

	// Renew language on change
	useEffect(() => {
		if (user) {
			setLanguage(user.language ?? languages[0]);
		} else {
			setLanguage(languages[0]);
		}
	}, [user]);

	// Exposed context value
	const value = useMemo(() => ({
		language,
		setLanguage: (lang: Language) => {
			setLanguage(lang);
		},
	}), [language]);

	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

// Hook for accessing this context
export const useLanguage = () => {
	const context = useContext(LanguageContext);
	if (context === undefined) {
		throw new Error('No language context found!');
	}
	return context;
};