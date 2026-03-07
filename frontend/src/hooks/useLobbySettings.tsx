import { useEffect, useRef, useState } from "react";
import type { LobbyStateData, MetaSettings, RoleSettings } from "../types/websocket";

const MIN_PLAYERS_LIMIT = 5;
const MAX_PLAYERS_LIMIT = 20;
const MIN_TIMER_SECONDS = 10;
const MAX_TIMER_SECONDS = 999;
const INPUT_APPLY_DELAY = 1000;
const SETTINGS_SAVE_DELAY = 5000;

export type NumericMetaInputKey =
	| "maxPlayers"
	| "minPlayers"
	| "daySeconds"
	| "votingSeconds"
	| "nightSeconds";

type MetaInputsState = Record<NumericMetaInputKey, string>;

type UseLobbySettingsParams = {
	lobbyState: LobbyStateData;
	onSaveSettings: (
		metaSettings: Partial<MetaSettings>,
		roleSettings: Partial<RoleSettings>,
		handlers: {
			onSuccess: () => void;
			onReject: () => void;
			onTimeout: () => void;
		}
	) => void;
};

export const useLobbySettings = ({ lobbyState, onSaveSettings }: UseLobbySettingsParams) => {
	const latestLobbyStateRef = useRef<LobbyStateData>(lobbyState);

	const [draftLobbySettings, setDraftLobbySettings] = useState<{ metaSettings: MetaSettings; roleSettings: RoleSettings }>({ metaSettings: lobbyState.metaSettings, roleSettings: lobbyState.roleSettings});
	const latestDraftSettingsRef = useRef<{ metaSettings: MetaSettings; roleSettings: RoleSettings }>({ metaSettings: lobbyState.metaSettings, roleSettings: lobbyState.roleSettings});

	const [metaInputs, setMetaInputs] = useState<MetaInputsState>({
		maxPlayers: String(lobbyState.metaSettings.maxPlayers),
		minPlayers: String(lobbyState.metaSettings.minPlayers),
		daySeconds: String(lobbyState.metaSettings.daySeconds),
		votingSeconds: String(lobbyState.metaSettings.votingSeconds),
		nightSeconds: String(lobbyState.metaSettings.nightSeconds)
	});

	const inputTimeoutsRef = useRef<Partial<Record<NumericMetaInputKey, number>>>({});
	const savingSettingsRef = useRef(false);
	const saveTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		latestDraftSettingsRef.current = draftLobbySettings;
	}, [draftLobbySettings]);

	useEffect(() => {
		setDraftLobbySettings({metaSettings: lobbyState.metaSettings, roleSettings: lobbyState.roleSettings});
	}, [lobbyState.metaSettings, lobbyState.roleSettings]);

	useEffect(() => {
		setMetaInputs({
			maxPlayers: String(draftLobbySettings.metaSettings.maxPlayers),
			minPlayers: String(draftLobbySettings.metaSettings.minPlayers),
			daySeconds: String(draftLobbySettings.metaSettings.daySeconds),
			votingSeconds: String(draftLobbySettings.metaSettings.votingSeconds),
			nightSeconds: String(draftLobbySettings.metaSettings.nightSeconds)
		});
	}, [draftLobbySettings.metaSettings]);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				window.clearTimeout(saveTimeoutRef.current);
			}

			for (const timeout of Object.values(inputTimeoutsRef.current)) {
				if (timeout) {
					window.clearTimeout(timeout);
				}
			}
		};
	}, []);

	const getChangedMetaSettings = (current: MetaSettings, next: MetaSettings) => {
		const changed: Partial<MetaSettings> = {};

		const assignIfChanged = <K extends keyof MetaSettings>(key: K) => {
			if (current[key] !== next[key]) {
				changed[key] = next[key];
			}
		};

		for (const key of Object.keys(next) as Array<keyof MetaSettings>) {
			assignIfChanged(key);
		}

		return changed;
	};

	const getChangedRoleSettings = (current: RoleSettings, next: RoleSettings) => {
		const changed: Partial<RoleSettings> = {};

		const assignIfChanged = <K extends keyof RoleSettings>(key: K) => {
			if (current[key] !== next[key]) {
				changed[key] = next[key];
			}
		};

		for (const key of Object.keys(next) as Array<keyof RoleSettings>) {
			assignIfChanged(key);
		}

		return changed;
	};

	const getChangedLobbySettings = (current: { metaSettings: MetaSettings; roleSettings: RoleSettings }, next: { metaSettings: MetaSettings; roleSettings: RoleSettings }) => {
		const metaSettings = getChangedMetaSettings(current.metaSettings, next.metaSettings);
		const roleSettings = getChangedRoleSettings(current.roleSettings, next.roleSettings);
		return { metaSettings, roleSettings };
	};

	const scheduleLobbySettingsSave = (nextSettings: { metaSettings: MetaSettings; roleSettings: RoleSettings }) => {
		if (saveTimeoutRef.current) {
			window.clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = window.setTimeout(() => {
			const currentSettings: { metaSettings: MetaSettings; roleSettings: RoleSettings } = { metaSettings: latestLobbyStateRef.current.metaSettings, roleSettings: latestLobbyStateRef.current.roleSettings};

			const changed = getChangedLobbySettings(currentSettings, nextSettings);
			const hasMetaChanges = Object.keys(changed.metaSettings).length > 0;
			const hasRoleChanges = Object.keys(changed.roleSettings).length > 0;

			if (!hasMetaChanges && !hasRoleChanges) return;
			if (savingSettingsRef.current) return;

			savingSettingsRef.current = true;

			onSaveSettings(changed.metaSettings, changed.roleSettings, {
				onSuccess: () => {
					savingSettingsRef.current = false;
				},
				onReject: () => {
					savingSettingsRef.current = false;
					setDraftLobbySettings({
						metaSettings: latestLobbyStateRef.current.metaSettings,
						roleSettings: latestLobbyStateRef.current.roleSettings
					});
				},
				onTimeout: () => {
					savingSettingsRef.current = false;
				}
			});
		}, SETTINGS_SAVE_DELAY);
	};

	const updateDraftMetaSetting = <K extends keyof MetaSettings>(key: K, value: MetaSettings[K]) => {
		setDraftLobbySettings((prev) => {
			if (prev.metaSettings[key] === value) return prev;

			const nextSettings: { metaSettings: MetaSettings; roleSettings: RoleSettings } = {
				...prev,
				metaSettings: {
					...prev.metaSettings,
					[key]: value
				}
			};

			scheduleLobbySettingsSave(nextSettings);
			return nextSettings;
		});
	};

	const resetMetaInput = (key: NumericMetaInputKey) => {
		setMetaInputs((prev) => ({
			...prev,
			[key]: String(latestDraftSettingsRef.current.metaSettings[key])
		}));
	};

	const applyMetaSetting = <K extends keyof MetaSettings>(key: K, rawValue: string | MetaSettings[K]) => {
		const currentMeta = latestDraftSettingsRef.current.metaSettings;
		const currentValue = currentMeta[key];

		if (typeof currentValue === "number") {
			const numericKey = key as NumericMetaInputKey;

			if (typeof rawValue !== "string" || rawValue.trim() === "") {
				resetMetaInput(numericKey);
				return;
			}

			const parsed = Number(rawValue);

			if (!Number.isFinite(parsed)) {
				resetMetaInput(numericKey);
				return;
			}

			let nextValue = Math.trunc(parsed);

			switch (key) {
				case "maxPlayers": {
					nextValue = Math.min(MAX_PLAYERS_LIMIT, Math.max(MIN_PLAYERS_LIMIT, nextValue));

					if (nextValue < latestLobbyStateRef.current.players.length || nextValue < currentMeta.minPlayers) {
						resetMetaInput("maxPlayers");
						return;
					}

					updateDraftMetaSetting("maxPlayers", nextValue);
					setMetaInputs((prev) => ({
						...prev,
						maxPlayers: String(nextValue)
					}));
					return;
				}

				case "minPlayers": {
					nextValue = Math.min(MAX_PLAYERS_LIMIT, Math.max(MIN_PLAYERS_LIMIT, nextValue));

					if (nextValue > currentMeta.maxPlayers) {
						resetMetaInput("minPlayers");
						return;
					}

					updateDraftMetaSetting("minPlayers", nextValue);
					setMetaInputs((prev) => ({
						...prev,
						minPlayers: String(nextValue)
					}));
					return;
				}

				case "daySeconds":
				case "votingSeconds":
				case "nightSeconds": {
					nextValue = Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, nextValue));

					updateDraftMetaSetting(key, nextValue as MetaSettings[K]);
					setMetaInputs((prev) => ({
						...prev,
						[numericKey]: String(nextValue)
					}));
					return;
				}

				default:
					return;
			}
		}

		switch (key) {
			case "tieBehavior":
			case "voteCountVisibility":
			case "anonymousVoting":
			case "roleRevealOnDeath":
				updateDraftMetaSetting(key, rawValue as MetaSettings[K]);
				return;

			default:
				return;
		}
	};

	const updateMetaInput = (key: NumericMetaInputKey, rawValue: string) => {
		setMetaInputs((prev) => ({
			...prev,
			[key]: rawValue
		}));

		const existingTimeout = inputTimeoutsRef.current[key];
		if (existingTimeout) {
			window.clearTimeout(existingTimeout);
		}

		inputTimeoutsRef.current[key] = window.setTimeout(() => {
			applyMetaSetting(key, rawValue);
		}, INPUT_APPLY_DELAY);
	};

	const flushMetaInput = (key: NumericMetaInputKey) => {
		const existingTimeout = inputTimeoutsRef.current[key];
		if (existingTimeout) {
			window.clearTimeout(existingTimeout);
			inputTimeoutsRef.current[key] = undefined;
		}

		applyMetaSetting(key, metaInputs[key]);
	};

	return { draftLobbySettings, metaInputs, applyMetaSetting, updateMetaInput, flushMetaInput };
};