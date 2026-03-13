import React, { useEffect, useMemo, useRef, useState } from "react";
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

const Settings = () => {
	const { t } = useTranslation();
	const { user, setUser } = useUser();
	const { setTheme, setColorTheme } = useTheme();
	const { setLanguage, language } = useLanguage();
	const { showPopup, closePopup } = usePopup();

	const makeSettingsFromUser = (u: User | null): UserSettings => ({
		theme: u?.theme ?? themes[0],
		colorTheme: u?.colorTheme ?? colorThemes[0],
		language: u?.language ?? languages[0],
		icon: u?.player.icon ?? "",
	});

	const [currentSettings, setCurrentSettings] = useState<UserSettings>(() =>
		makeSettingsFromUser(user ?? null)
	);

	const originalSettingsRef = useRef<UserSettings>(
		makeSettingsFromUser(user ?? null)
	);

	const [iconPreviewUrl, setIconPreviewUrl] = useState<string>(() => (user?.player.icon ?? ""));
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const resolvedPreviewUrl = useMemo(() => {
		return iconPreviewUrl && iconPreviewUrl.trim().length > 0 ? iconPreviewUrl : defaultIcon;
	}, [iconPreviewUrl]);

	const isChanged = (next: UserSettings) => {
		const orig = originalSettingsRef.current;
		return (
			next.theme !== orig.theme ||
			next.colorTheme !== orig.colorTheme ||
			next.language !== orig.language ||
			next.icon !== orig.icon
		);
	};

	const hasUnsavedChanges = isChanged(currentSettings);
	const hasUnsavedRef = useRef(hasUnsavedChanges);

	useEffect(() => {
		hasUnsavedRef.current = hasUnsavedChanges;
	}, [hasUnsavedChanges]);

	const applyPreview = (next: UserSettings) => {
		setTheme(next.theme);
		setColorTheme(next.colorTheme);
		setLanguage(next.language);
	};

	const resetFileInput = () => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
	};

	const revertContextToOriginal = () => {
		const orig = originalSettingsRef.current;
		setTheme(orig.theme);
		setColorTheme(orig.colorTheme);
		setLanguage(orig.language);
		setIconPreviewUrl(orig.icon || "");
		resetFileInput();
	};

	useEffect(() => {
		if (!user) return;
		if (hasUnsavedRef.current) return;

		const next = makeSettingsFromUser(user);
		setCurrentSettings(next);
		originalSettingsRef.current = next;

		setIconPreviewUrl(next.icon || "");
		resetFileInput();
	}, [user]);

	useEffect(() => {
		return () => {
			if (!hasUnsavedRef.current) return;
			revertContextToOriginal();
		};
	}, []);

	const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newLanguage = e.target.value as Language;
		const next: UserSettings = { ...currentSettings, language: newLanguage };

		setCurrentSettings(next);
		applyPreview(next);
	};

	const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newTheme = e.target.value as Theme;
		const next: UserSettings = { ...currentSettings, theme: newTheme };

		setCurrentSettings(next);
		applyPreview(next);
	};

	const handleColorThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newColorTheme = e.target.value as ColorTheme;
		const next: UserSettings = { ...currentSettings, colorTheme: newColorTheme };

		setCurrentSettings(next);
		applyPreview(next);
	};

	const handlePickIconClick = () => {
		fileInputRef.current?.click();
	};

	const fileToDataUrl = (file: File) => {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
			reader.onload = () => resolve(String(reader.result));
			reader.readAsDataURL(file);
		});
	};

	const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] ?? null;
		if (!file) return;

		if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("components.sidebar.settings.iconUpload.invalidType") },
				autoCloseDelay: 5000,
			});
			resetFileInput();
			return;
		}

		try {
			const dataUrl = await fileToDataUrl(file);

			setIconPreviewUrl(dataUrl);
			setCurrentSettings({ ...currentSettings, icon: dataUrl });
		} catch {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("components.sidebar.settings.iconUpload.readFailed") },
				autoCloseDelay: 5000,
			});
		} finally {
			resetFileInput();
		}
	};

	const handleSaveClick = async () => {
		const settingsToSave: UserSettings = { ...currentSettings };

		const loadingId = showPopup({
			type: "loading",
			title: t("common.loading"),
			payload: {},
		});
		const response = await userService.saveSettings(settingsToSave);
		setTimeout(() => {
			closePopup(loadingId);
		}, 500);

		if (response.success) {
			originalSettingsRef.current = settingsToSave;
			setCurrentSettings(settingsToSave);

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

			showPopup({
				type: "success",
				title: t("common.success"),
				payload: { message: t("components.sidebar.settings.saveSuccessMessage") },
				autoCloseDelay: 5000,
			});
		} else {
			setCurrentSettings(originalSettingsRef.current);
			revertContextToOriginal();

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

	return (
		<div className="container">
			<div className="settings-container">
				<h2>{t("components.sidebar.settings.header")}</h2>

				<div>
					<h4>{t("components.sidebar.settings.languages")}</h4>
					<div className="form-group">
						<select
							className="custom-dropdown"
							value={currentSettings.language}
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
							value={currentSettings.theme}
							onChange={handleThemeChange}
						>
							<option value="light">
								{t("components.sidebar.settings.themeSelect.light")}
							</option>
							<option value="dark">
								{t("components.sidebar.settings.themeSelect.dark")}
							</option>
						</select>
					</div>
				</div>

				<div>
					<h4>{t("components.sidebar.settings.colorThemes")}</h4>
					<div className="form-group">
						<select
							className="custom-dropdown"
							value={currentSettings.colorTheme}
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
								/>
							</div>
						</Tooltip>

						<input
							ref={fileInputRef}
							type="file"
							accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
							onChange={handleIconChange}
							className="icon-picker-input"
						/>
					</div>
				</div>

			</div>

			<div className="sidebar-footer">
				<button className="custom-button" onClick={handleSaveClick}>
					{t("common.save")}
				</button>
			</div>
		</div>
	);
};

export default Settings;