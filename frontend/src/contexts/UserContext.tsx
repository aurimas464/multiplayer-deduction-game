import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { User } from "../types/settings";
import { authService } from "../services/auth";
import { colorThemes, languages, themes } from "../types/settings";
import { setOnUnauthorizedLogout } from "../services/api/api";
import { useNavigate } from "react-router-dom";
import { userService } from "../services/user";

type UserContextType = {
	user: User | null;
	authReady: boolean;
	setUser: (user: User | null) => void;
	logout: () => Promise<void>;
}

// Starts as undefined so that cases where app is used without context throws an error
const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
	// Load user from localStorage (may be null if user is not logged in)
	const [user, setUser] = useState<User | null>(() => {
		const storedUser = localStorage.getItem("user");
		if (!storedUser) return null;

		try {
			const parsedUser = JSON.parse(storedUser);
			const theme = typeof parsedUser.theme === "number"
				? themes[parsedUser.theme]
				: parsedUser.theme;
			const colorTheme = typeof parsedUser.colorTheme === "number"
				? colorThemes[parsedUser.colorTheme]
				: parsedUser.colorTheme;
			const language = typeof parsedUser.language === "number"
				? languages[parsedUser.language]
				: parsedUser.language;

			return {
				...parsedUser,
				theme: themes.includes(theme) ? theme : themes[0],
				colorTheme: colorThemes.includes(colorTheme) ? colorTheme : colorThemes[0],
				language: languages.includes(language) ? language : languages[0],
			} as User;
		} catch {
			return null;
		}
	});
	const [authReady, setAuthReady] = useState(false);
	const navigate = useNavigate();

	// User cleanup function
	const cleanupUserData = useCallback(() => {
		localStorage.removeItem("user");
		authService.clearAccessToken();
		setUser(null);
		navigate("/login", { replace: false });
	}, [navigate]);

	// Renew user in localStorage on change
	useEffect(() => {
		if (!user) {
			localStorage.removeItem("user");
			return;
		}

		localStorage.setItem("user", JSON.stringify(user));
	}, [user]);

	//On mount
	useEffect(() => {
		let isMounted = true;

		const validateUserData = async () => {
			try {
				const existingToken = authService.getAccessToken();
				if (!existingToken) {
					if (!user) {
						authService.clearAccessToken();
						return;
					}

					const refreshed = await authService.refreshToken();
					if (!refreshed) {
						if (!isMounted) return;
						cleanupUserData();
						return;
					}
				}

				if(user == null){
					const userData = await userService.getMe();

					if (!userData.success || !userData.result) {
						if (!isMounted) return;
						cleanupUserData();
						return;
					}

					setUser(userData.result);
				}
			} catch {
				if (!isMounted) return;
				cleanupUserData();
			} finally {
				if (isMounted)
					setAuthReady(true);
			}
		};

		validateUserData();
		return () => {
			isMounted = false;
		};
	}, [cleanupUserData, user]);

	// Logout function
	const logout = useCallback(async () => {
		try {
			await authService.logout();
		} catch {
			// ignore
		}
		cleanupUserData();
	}, [cleanupUserData]);

	// Set up unauthorized logout handler
	useEffect(() => {
		setOnUnauthorizedLogout(cleanupUserData);
	}, [cleanupUserData]);

	// Exposed context value
	const value = useMemo(() => ({
		user,
		authReady,
		setUser: (newUser: User | null) => {
			setUser(newUser);
		},
		logout,
	}), [user, authReady, logout]);

	return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

// Hook for accessing this context
export const useUser = () => {
	const context = useContext(UserContext);
	if (context === undefined) {
		throw new Error("No user context found!");
	}
	return context;
};
