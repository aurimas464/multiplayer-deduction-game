import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { themes, colorThemes, type Theme, type ColorTheme } from '../types/settings';
import { useUser } from './UserContext';

type ThemeContextType = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	colorTheme: ColorTheme;
	setColorTheme: (colorTheme: ColorTheme) => void;
}

// Starts as undefined so that cases where app is used without context throws an error
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const { user } = useUser();

	// Initialize themes from user (or default)
	const [theme, setTheme] = useState<Theme>(() => {
		return user?.theme ?? themes[0];
	});
	const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
		return user?.colorTheme ?? colorThemes[0];
	});

	// Apply themes class to html
	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);
	useEffect(() => {
		document.documentElement.setAttribute('data-color-theme', colorTheme);
	}, [colorTheme]);

	useEffect(() => {
		if (user) {
			setTheme(user.theme ?? themes[0]);
			setColorTheme(user.colorTheme ?? colorThemes[0]);
		} else {
			setTheme(themes[0]);
			setColorTheme(colorThemes[0]);
		}
	}, [user]);

	// Exposed context value
	const value = useMemo(() => ({
		theme,
		setTheme: (theme: Theme) => {
			setTheme(theme);
		},
		colorTheme,
		setColorTheme: (colorTheme: ColorTheme) => {
			setColorTheme(colorTheme);
		},
	}), [theme, colorTheme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Hook for accessing this context
export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('No theme context found!');
	}
	return context;
};