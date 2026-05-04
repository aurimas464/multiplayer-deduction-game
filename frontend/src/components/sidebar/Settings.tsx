import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { type Theme, type ColorTheme, type Language, themes, colorThemes, languages, type User, type UserSettings } from "../../types/settings";
import { userService } from "../../services/user";
import { useUser } from "../../contexts/UserContext";
import { useTranslation } from "../../hooks/useTranslation";
import { usePopup } from "../../contexts/PopupContext";
import { errorMapper } from "../../utils/errorMapper";
import defaultIcon from "../../assets/default-user-icon.png";
import { Tooltip } from "../Tooltip";

const ALLOWED_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
] as const;

const makeSettingsFromUser = (user: User | null): UserSettings => ({
	theme: user?.theme ?? themes[0],
	colorTheme: user?.colorTheme ?? colorThemes[0],
	language: user?.language ?? languages[0],
	icon: user?.player.icon ?? "",
});

const areSettingsEqual = (left: UserSettings, right: UserSettings) => {
	return (
		left.theme === right.theme &&
		left.colorTheme === right.colorTheme &&
		left.language === right.language &&
		left.icon === right.icon
	);
};

const Settings = () => {
	const { t } = useTranslation();
	const { user, setUser } = useUser();
	const { setTheme, setColorTheme } = useTheme();
	const { setLanguage, language } = useLanguage();
	const { showPopup, closePopup } = usePopup();

	const [draftSettings, setDraftSettings] = useState<UserSettings>(() =>
		makeSettingsFromUser(user ?? null)
	);
	const [savedSettings, setSavedSettings] = useState<UserSettings>(() =>
		makeSettingsFromUser(user ?? null)
	);
	const savedSettingsRef = useRef<UserSettings>(savedSettings);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const resolvedPreviewUrl = draftSettings.icon.trim().length > 0 ? draftSettings.icon : defaultIcon;
	const hasUnsavedChanges = !areSettingsEqual(draftSettings, savedSettings);
	const hasUnsavedRef = useRef(hasUnsavedChanges);

	// Update draft settings and track unsaved changes
	const updateDraftSettings = useCallback((next: UserSettings) => {
		hasUnsavedRef.current = !areSettingsEqual(next, savedSettingsRef.current);
		setDraftSettings(next);
	}, []);

	// Apply settings preview to contexts (theme, color, language)
	const applyPreview = useCallback((next: UserSettings) => {
		setTheme(next.theme);
		setColorTheme(next.colorTheme);
		setLanguage(next.language);
	}, [setColorTheme, setLanguage, setTheme]);

	// Apply preview whenever draft settings change
	useEffect(() => {
		applyPreview(draftSettings);
	}, [applyPreview, draftSettings]);

	// Reset file input value
	const resetFileInput = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
	}, []);

	// Revert contexts to last saved settings
	const revertContextToSaved = useCallback(() => {
		const saved = savedSettingsRef.current;
		setTheme(saved.theme);
		setColorTheme(saved.colorTheme);
		setLanguage(saved.language);
		resetFileInput();
	}, [resetFileInput, setColorTheme, setLanguage, setTheme]);

	// Sync settings when user data changes (but preserve unsaved changes)
	useEffect(() => {
		if (hasUnsavedRef.current) return;

		const next = makeSettingsFromUser(user ?? null);
		hasUnsavedRef.current = false;
		savedSettingsRef.current = next;
		setDraftSettings(next);
		setSavedSettings(next);
		resetFileInput();
	}, [resetFileInput, user]);

	// Cleanup: revert contexts if there are unsaved changes on unmount
	useEffect(() => {
		return () => {
			if (!hasUnsavedRef.current) return;
			revertContextToSaved();
		};
	}, [revertContextToSaved]);

	// Input change handlers for different setting types
	const handleLanguageChange = (e: ChangeEvent<HTMLSelectElement>) => {
		const newLanguage = e.target.value as Language;
		const next: UserSettings = { ...draftSettings, language: newLanguage };

		updateDraftSettings(next);
	};

	const handleThemeChange = (e: ChangeEvent<HTMLSelectElement>) => {
		const newTheme = e.target.value as Theme;
		const next: UserSettings = { ...draftSettings, theme: newTheme };

		updateDraftSettings(next);
	};

	const handleColorThemeChange = (e: ChangeEvent<HTMLSelectElement>) => {
		const newColorTheme = e.target.value as ColorTheme;
		const next: UserSettings = { ...draftSettings, colorTheme: newColorTheme };

		updateDraftSettings(next);
	};

	// Icon picker handlers
	const handlePickIconClick = () => {
		fileInputRef.current?.click();
	};

	// Convert file to data URL for preview
	const fileToDataUrl = (file: File) => {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
			reader.onload = () => resolve(String(reader.result));
			reader.readAsDataURL(file);
		});
	};

	// Handle icon file upload with validation
	const handleIconChange = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] ?? null;
		if (!file) return;

		// Validate file type
		if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
			showPopup({
				type: "error",
				title: t("common.error"),
				position: "center",
				payload: { message: t("components.sidebar.settings.iconUpload.invalidType") },
				autoCloseDelay: 5000,
			});
			resetFileInput();
			return;
		}

		try {
			const dataUrl = await fileToDataUrl(file);

			// Update draft settings with new icon
			setDraftSettings((prev) => {
				const next = { ...prev, icon: dataUrl };
				hasUnsavedRef.current = !areSettingsEqual(next, savedSettingsRef.current);
				return next;
			});
		} catch {
			showPopup({
				type: "error",
				title: t("common.error"),
				position: "center",
				payload: { message: t("components.sidebar.settings.iconUpload.readFailed") },
				autoCloseDelay: 5000,
			});
		} finally {
			resetFileInput();
		}
	};

	// Save settings to server with loading state and error handling
	const handleSaveClick = async () => {
		if (!hasUnsavedChanges) return;

		const settingsToSave: UserSettings = { ...draftSettings };

		// Show loading popup
		const loadingId = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {},
		});

		try {
			const response = await userService.saveSettings(settingsToSave);

			if (response.success) {
				// Update all state refs and state variables on success
				hasUnsavedRef.current = false;
				savedSettingsRef.current = settingsToSave;
				setSavedSettings(settingsToSave);
				setDraftSettings(settingsToSave);

				// Update user context with new settings
				if (user) {
					setUser({
						...user,
						colorTheme: settingsToSave.colorTheme,
						theme: settingsToSave.theme,
						language: settingsToSave.language,
						player: {
							...user.player,
							icon: settingsToSave.icon,
						},
					});
				}

				// Show success popup
				showPopup({
					type: "success",
					title: t("common.success"),
					position: "center",
					payload: { message: t("components.sidebar.settings.saveSuccessMessage") },
					autoCloseDelay: 5000,
				});

				return;
			}

			// Handle server error response
			hasUnsavedRef.current = false;
			setDraftSettings(savedSettingsRef.current);
			revertContextToSaved();

			const code = response.errors?.[0]?.code;
			const errorMessage = errorMapper(code, t, language);
			showPopup({
				type: "error",
				title: t("common.error"),
				position: "center",
				payload: { message: errorMessage },
				autoCloseDelay: 5000,
			});
			
		} finally {
			// Always close loading popup
			closePopup(loadingId);
		}
	};

	return (
		<div className="container">
			<div className="settings-container">
				<h2>{t("components.sidebar.settings.header")}</h2>

				<div>
					<h4>{t("components.sidebar.settings.languages")}</h4>
					<div className="form-group">
						<select
							className="custom-dropdown"
							id="settings-language"
							name="language"
							value={draftSettings.language}
							onChange={handleLanguageChange}
						>
							<option value="en">
								{t("components.sidebar.settings.languageSelect.english")}
							</option>
							<option value="lt">
								{t("components.sidebar.settings.languageSelect.lithuanian")}
							</option>
						</select>
					</div>
				</div>

				<div>
					<h4>{t("components.sidebar.settings.themes")}</h4>
					<div className="form-group">
						<select
							className="custom-dropdown"
							id="settings-theme"
							name="theme"
							value={draftSettings.theme}
							onChange={handleThemeChange}
						>
							<option value="dark">
								{t("components.sidebar.settings.themeSelect.dark")}
							</option>
							<option value="light">
								{t("components.sidebar.settings.themeSelect.light")}
							</option>
							<option value="dynamic">
								{t("components.sidebar.settings.themeSelect.dynamic")}
							</option>

						</select>
					</div>
				</div>

				<div>
					<h4>{t("components.sidebar.settings.colorThemes")}</h4>
					<div className="form-group">
						<select
							className="custom-dropdown"
							id="settings-color-theme"
							name="colorTheme"
							value={draftSettings.colorTheme}
							onChange={handleColorThemeChange}
						>
							<option value="red">
								{t("components.sidebar.settings.colorThemeSelect.red")}
							</option>
							<option value="blue">
								{t("components.sidebar.settings.colorThemeSelect.blue")}
							</option>
							<option value="purple">
								{t("components.sidebar.settings.colorThemeSelect.purple")}
							</option>
							<option value="gold">
								{t("components.sidebar.settings.colorThemeSelect.gold")}
							</option>
						</select>
					</div>
				</div>

				<div>
					<h4>{t("components.sidebar.settings.icon")}</h4>

					<div className="form-group">
						<Tooltip
							key="icon-picker"
							content={t("components.sidebar.settings.iconPicker")}
							position="right"
							showDelay={500}
						>
							<div
								role="button"
								onClick={handlePickIconClick}
								className="icon-picker"
							>
								<img
									className="player-icon"
									src={resolvedPreviewUrl}
									alt=""
								/>
							</div>
						</Tooltip>

						<input
							ref={fileInputRef}
							type="file"
							id="settings-icon"
							name="icon"
							accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
							onChange={handleIconChange}
							className="icon-picker-input"
						/>
					</div>
				</div>

			</div>

			<div className="sidebar-footer">
				<button className="custom-button" onClick={handleSaveClick} disabled={!hasUnsavedChanges}>
					{t("common.save")}
				</button>
			</div>
		</div>
	);
};

export default Settings;
