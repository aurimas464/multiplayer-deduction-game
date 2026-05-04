import { useEffect, useRef, useState } from "react";
import type { LobbyStateData, MetaSettings, RoleSettings } from "../types/websocket";

const MIN_PLAYERS_LIMIT = 5;
const MAX_PLAYERS_LIMIT = 20;
const MIN_TIMER_SECONDS = 10;
const MAX_TIMER_SECONDS = 999;
const INPUT_APPLY_DELAY = 1000;
const SETTINGS_SAVE_DELAY = 2000;

export type NumericMetaInputKey =
	| "maxPlayers"
	| "minPlayers"
	| "daySeconds"
	| "votingSeconds"
	| "nightSeconds";

type MetaInputsState = Record<NumericMetaInputKey, string>;

type SaveLobbySettings = (
	metaSettings: Partial<MetaSettings>,
	roleSettings: RoleSettings,
	handlers: {
		onSuccess: () => void;
		onReject: () => void;
		onTimeout: () => void;
	}
) => void;

type UseLobbySettingsParams = {
	lobbyState: LobbyStateData;
	canEdit: boolean;
	onSaveSettings: SaveLobbySettings;
};

type DraftLobbySettings = {
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
};

// Create a local editable copy of lobby settings from the latest server lobby state
const createDraftLobbySettings = (state: LobbyStateData): DraftLobbySettings => ({
	metaSettings: { ...state.metaSettings },
	roleSettings: { ...state.roleSettings }
});

// Convert numeric meta settings to input strings so empty/temporary values can be handled
const createMetaInputs = (metaSettings: MetaSettings): MetaInputsState => ({
	maxPlayers: String(metaSettings.maxPlayers),
	minPlayers: String(metaSettings.minPlayers),
	daySeconds: String(metaSettings.daySeconds),
	votingSeconds: String(metaSettings.votingSeconds),
	nightSeconds: String(metaSettings.nightSeconds)
});

// Get only meta settings that changed compared to current server values
const getChangedMetaSettings = (current: MetaSettings, next: MetaSettings): Partial<MetaSettings> => {
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

// Get only role settings that changed compared to current server values
const getChangedRoleSettings = (current: RoleSettings, next: RoleSettings): RoleSettings => {
	const changed: RoleSettings = {} as RoleSettings;
	const keys = new Set([...Object.keys(current), ...Object.keys(next)]);

	for (const key of keys) {
		const numericKey = Number(key);
		const currentValue = current[numericKey];
		const nextValue = next[numericKey];

		if (currentValue !== nextValue) {
			changed[numericKey] = nextValue ?? 0;
		}
	}

	return changed;
};

// Collect changed meta and role settings into one payload object
const getChangedLobbySettings = (current: DraftLobbySettings, next: DraftLobbySettings) => {
	return {
		metaSettings: getChangedMetaSettings(current.metaSettings, next.metaSettings),
		roleSettings: getChangedRoleSettings(current.roleSettings, next.roleSettings)
	};
};

// Check if two lobby settings objects are equal by comparing their changed fields
const isDraftLobbySettingsEqual = (left: DraftLobbySettings, right: DraftLobbySettings) => {
	const changed = getChangedLobbySettings(left, right);
	return Object.keys(changed.metaSettings).length === 0 && Object.keys(changed.roleSettings).length === 0;
};

export const useLobbySettings = ({ lobbyState, canEdit, onSaveSettings }: UseLobbySettingsParams) => {
	const latestLobbyStateRef = useRef<LobbyStateData>(lobbyState);
	const latestDraftSettingsRef = useRef<DraftLobbySettings>(createDraftLobbySettings(lobbyState));
	const canEditRef = useRef(canEdit);
	const onSaveSettingsRef = useRef<SaveLobbySettings>(onSaveSettings);
	const pendingSavedSettingsRef = useRef<DraftLobbySettings | null>(null);
	const queuedSettingsRef = useRef<DraftLobbySettings | null>(null);
	const hasLocalPendingChangesRef = useRef(false);

	const [draftLobbySettings, setDraftLobbySettings] = useState<DraftLobbySettings>(
		createDraftLobbySettings(lobbyState)
	);

	const [metaInputs, setMetaInputs] = useState<MetaInputsState>(
		createMetaInputs(lobbyState.metaSettings)
	);

	const [isSavingSettings, setIsSavingSettings] = useState(false);

	const inputTimeoutsRef = useRef<Partial<Record<NumericMetaInputKey, number>>>({});
	const activeMetaInputKeysRef = useRef(new Set<NumericMetaInputKey>());
	const savingSettingsRef = useRef(false);
	const saveTimeoutRef = useRef<number | null>(null);

	const resetDraftToLatestServer = () => {
		const currentSettings = createDraftLobbySettings(latestLobbyStateRef.current);

		latestDraftSettingsRef.current = currentSettings;
		setDraftLobbySettings(currentSettings);
		setMetaInputs(createMetaInputs(currentSettings.metaSettings));
	};

	const cancelPendingSave = () => {
		if (saveTimeoutRef.current) {
			window.clearTimeout(saveTimeoutRef.current);
			saveTimeoutRef.current = null;
		}

		queuedSettingsRef.current = null;
		pendingSavedSettingsRef.current = null;
		hasLocalPendingChangesRef.current = false;
	};

	const clearMetaInputTimeout = (key: NumericMetaInputKey) => {
		const existingTimeout = inputTimeoutsRef.current[key];

		if (existingTimeout) {
			window.clearTimeout(existingTimeout);
			inputTimeoutsRef.current[key] = undefined;
		}
	};

	// Finish the active save and optionally run queued save if the user changed settings while saving
	const finishSaving = (shouldRunQueued = true) => {
		savingSettingsRef.current = false;
		setIsSavingSettings(false);

		const queuedSettings = queuedSettingsRef.current;
		queuedSettingsRef.current = null;

		if (shouldRunQueued && queuedSettings) {
			scheduleLobbySettingsSave(queuedSettings);
		}
	};

	// Keep latest server lobby state available for delayed callbacks
	useEffect(() => {
		latestLobbyStateRef.current = lobbyState;
	}, [lobbyState]);

	// Delayed saves should always call the latest save handler from the page render
	useEffect(() => {
		onSaveSettingsRef.current = onSaveSettings;
	});

	// Cancel unsent edits if the current player loses permission to edit settings
	useEffect(() => {
		canEditRef.current = canEdit;

		if (canEdit) return;

		cancelPendingSave();
		resetDraftToLatestServer();
	}, [canEdit]);

	// Sync draft settings from server when the lobby state changes,
	// but avoid overwriting local pending changes until server catches up
	useEffect(() => {
		let cancelled = false;
		const currentLobbySettings = createDraftLobbySettings(lobbyState);

		if (hasLocalPendingChangesRef.current) {
			if (!isDraftLobbySettingsEqual(currentLobbySettings, latestDraftSettingsRef.current)) {
				return;
			}

			hasLocalPendingChangesRef.current = false;
			pendingSavedSettingsRef.current = null;
		}

		if (isSavingSettings) {
			return;
		}

		const pendingSavedSettings = pendingSavedSettingsRef.current;
		if (pendingSavedSettings) {
			if (!isDraftLobbySettingsEqual(currentLobbySettings, pendingSavedSettings)) {
				return;
			}

			pendingSavedSettingsRef.current = null;
		}

		const timer = window.setTimeout(() => {
			if (cancelled) return;

			latestDraftSettingsRef.current = currentLobbySettings;
			setDraftLobbySettings(currentLobbySettings);
		}, 0);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [lobbyState, isSavingSettings]);

	// Keep latest draft settings available for validation and input reset logic
	useEffect(() => {
		latestDraftSettingsRef.current = draftLobbySettings;
	}, [draftLobbySettings]);

	// Keep numeric input strings in sync with the current draft settings
	useEffect(() => {
		setMetaInputs((prev) => {
			const nextInputs = createMetaInputs(draftLobbySettings.metaSettings);

			for (const key of activeMetaInputKeysRef.current) {
				nextInputs[key] = prev[key];
			}

			return nextInputs;
		});
	}, [draftLobbySettings.metaSettings]);

	// Clear delayed input/save timers on unmount
	useEffect(() => {
		const inputTimeouts = inputTimeoutsRef.current;

		return () => {
			if (saveTimeoutRef.current) {
				window.clearTimeout(saveTimeoutRef.current);
			}

			for (const timeout of Object.values(inputTimeouts)) {
				if (timeout) {
					window.clearTimeout(timeout);
				}
			}
		};
	}, []);

	// Schedule lobby settings save after a short delay to avoid sending every small change instantly
	const scheduleLobbySettingsSave = (nextSettings: DraftLobbySettings) => {
		if (saveTimeoutRef.current) {
			window.clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = window.setTimeout(() => {
			saveTimeoutRef.current = null;

			if (!canEditRef.current) {
				cancelPendingSave();
				resetDraftToLatestServer();
				return;
			}

			const currentSettings = createDraftLobbySettings(latestLobbyStateRef.current);
			const changed = getChangedLobbySettings(currentSettings, nextSettings);

			const hasMetaChanges = Object.keys(changed.metaSettings).length > 0;
			const hasRoleChanges = Object.keys(changed.roleSettings).length > 0;

			if (!hasMetaChanges && !hasRoleChanges) {
				hasLocalPendingChangesRef.current = false;
				pendingSavedSettingsRef.current = null;
				return;
			}

			// If a save is already running, queue the latest settings instead of dropping them
			if (savingSettingsRef.current) {
				queuedSettingsRef.current = nextSettings;
				return;
			}

			savingSettingsRef.current = true;
			setIsSavingSettings(true);
			pendingSavedSettingsRef.current = nextSettings;

			onSaveSettingsRef.current(changed.metaSettings, changed.roleSettings, {
				onSuccess: () => {
					finishSaving(true);
				},
				onReject: () => {
					finishSaving(false);
					pendingSavedSettingsRef.current = null;
					hasLocalPendingChangesRef.current = false;
					const currentSettings = createDraftLobbySettings(latestLobbyStateRef.current);
					latestDraftSettingsRef.current = currentSettings;
					setDraftLobbySettings(currentSettings);
				},
				onTimeout: () => {
					finishSaving(false);
					pendingSavedSettingsRef.current = null;
					hasLocalPendingChangesRef.current = false;
					const currentSettings = createDraftLobbySettings(latestLobbyStateRef.current);
					latestDraftSettingsRef.current = currentSettings;
					setDraftLobbySettings(currentSettings);
				}
			});
		}, SETTINGS_SAVE_DELAY);
	};

	// Update one meta setting in the draft and schedule a delayed save
	const updateDraftMetaSetting = <K extends keyof MetaSettings>(key: K, value: MetaSettings[K]) => {
		const prev = latestDraftSettingsRef.current;

		if (prev.metaSettings[key] === value) {
			return;
		}

		const nextSettings: DraftLobbySettings = {
			...prev,
			metaSettings: {
				...prev.metaSettings,
				[key]: value
			}
		};

		latestDraftSettingsRef.current = nextSettings;
		hasLocalPendingChangesRef.current = true;
		setDraftLobbySettings(nextSettings);
		scheduleLobbySettingsSave(nextSettings);
	};

	// Update one role count in the draft and schedule a delayed save
	const updateDraftRoleSetting = (roleId: number, value: number) => {
		const prev = latestDraftSettingsRef.current;
		const nextRoleValue = Math.max(0, value);

		if ((prev.roleSettings[roleId] ?? 0) === nextRoleValue) {
			return;
		}

		const nextSettings: DraftLobbySettings = {
			...prev,
			roleSettings: {
				...prev.roleSettings,
				[roleId]: nextRoleValue
			}
		};

		latestDraftSettingsRef.current = nextSettings;
		hasLocalPendingChangesRef.current = true;
		setDraftLobbySettings(nextSettings);
		scheduleLobbySettingsSave(nextSettings);
	};

	// Parse and apply role setting input
	const applyRoleSetting = (roleId: number, rawValue: string | number) => {
		const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);

		if (!Number.isFinite(parsed)) {
			return;
		}

		const nextValue = Math.max(0, Math.trunc(parsed));
		updateDraftRoleSetting(roleId, nextValue);
	};

	// Reset numeric input back to the latest valid draft value
	const resetMetaInput = (key: NumericMetaInputKey) => {
		setMetaInputs((prev) => ({
			...prev,
			[key]: String(latestDraftSettingsRef.current.metaSettings[key])
		}));
	};

	// Validate, clamp and apply one meta setting
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
			case "roleDistributionMode":
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

	// Update input text immediately and apply the value after a short delay
	const updateMetaInput = (key: NumericMetaInputKey, rawValue: string) => {
		activeMetaInputKeysRef.current.add(key);

		setMetaInputs((prev) => ({
			...prev,
			[key]: rawValue
		}));

		clearMetaInputTimeout(key);

		inputTimeoutsRef.current[key] = window.setTimeout(() => {
			inputTimeoutsRef.current[key] = undefined;
			activeMetaInputKeysRef.current.delete(key);
			applyMetaSetting(key, rawValue);
		}, INPUT_APPLY_DELAY);
	};

	// Apply input immediately, usually when input loses focus
	const flushMetaInput = (key: NumericMetaInputKey) => {
		clearMetaInputTimeout(key);
		activeMetaInputKeysRef.current.delete(key);

		applyMetaSetting(key, metaInputs[key]);
	};

	// Stepper buttons should change the draft immediately instead of waiting for text-input debounce
	const stepMetaInput = (key: NumericMetaInputKey, delta: number) => {
		clearMetaInputTimeout(key);
		activeMetaInputKeysRef.current.delete(key);

		const currentInput = metaInputs[key];
		const parsedInput = Number(currentInput);
		const fallbackValue = latestDraftSettingsRef.current.metaSettings[key];
		const baseValue = currentInput.trim() !== "" && Number.isFinite(parsedInput)
			? parsedInput
			: fallbackValue;

		applyMetaSetting(key, String(Math.trunc(baseValue) + delta));
	};

	return { draftLobbySettings, metaInputs, isSavingSettings, applyMetaSetting, updateMetaInput, flushMetaInput, stepMetaInput, applyRoleSetting };
};
