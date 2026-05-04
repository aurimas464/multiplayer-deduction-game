import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import { themes, colorThemes, type Theme, type ColorTheme } from "../types/settings";
import { useUser } from "./UserContext";

type AppliedTheme = Exclude<Theme, "dynamic">;

type ThemeContextType = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	setDynamicTheme: (theme: AppliedTheme | null) => void;
	colorTheme: ColorTheme;
	setColorTheme: (colorTheme: ColorTheme) => void;
}

// Starts as undefined so that cases where app is used without context throws an error
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const { user } = useUser();
	const userId = user?.id ?? null;

	const getAppliedTheme = (theme: Theme, dynamicTheme: AppliedTheme | null): AppliedTheme => {
		return theme === "dynamic" ? dynamicTheme ?? "light" : theme;
	};

	const [themePreview, setThemePreview] = useState<{ userId: number | null; value: Theme } | null>(null);
	const [colorThemePreview, setColorThemePreview] = useState<{ userId: number | null; value: ColorTheme } | null>(null);
	const [dynamicTheme, setDynamicTheme] = useState<AppliedTheme | null>(null);

	const theme = themePreview?.userId === userId ? themePreview.value : user?.theme ?? themes[0];
	const colorTheme = colorThemePreview?.userId === userId ? colorThemePreview.value : user?.colorTheme ?? colorThemes[0];

	// Apply themes class to html
	useEffect(() => {
		document.documentElement.setAttribute("data-theme", getAppliedTheme(theme, dynamicTheme));
	}, [dynamicTheme, theme]);

	useEffect(() => {
		document.documentElement.setAttribute("data-color-theme", colorTheme);
	}, [colorTheme]);

	const setTheme = useCallback((value: Theme) => {
		setThemePreview({ userId, value });
	}, [userId]);

	const setColorTheme = useCallback((value: ColorTheme) => {
		setColorThemePreview({ userId, value });
	}, [userId]);

	// Exposed context value
	const value = useMemo(() => ({
		theme,
		setTheme,
		setDynamicTheme,
		colorTheme,
		setColorTheme,
	}), [colorTheme, setColorTheme, setTheme, theme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Hook for accessing this context
export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("No theme context found!");
	}
	return context;
};
