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
		roleSettings: RoleSettings,
		handlers: {
			onSuccess: () => void;
			onReject: () => void;
			onTimeout: () => void;
		}
	) => void;
};

type DraftLobbySettings = {
	metaSettings: MetaSettings;
	roleSettings: RoleSettings;
};

export const useLobbySettings = ({ lobbyState, onSaveSettings }: UseLobbySettingsParams) => {
	const createDraftLobbySettings = (state: LobbyStateData): DraftLobbySettings => ({
		metaSettings: state.metaSettings,
		roleSettings: state.roleSettings
	});

	const createMetaInputs = (metaSettings: MetaSettings): MetaInputsState => ({
		maxPlayers: String(metaSettings.maxPlayers),
		minPlayers: String(metaSettings.minPlayers),
		daySeconds: String(metaSettings.daySeconds),
		votingSeconds: String(metaSettings.votingSeconds),
		nightSeconds: String(metaSettings.nightSeconds)
	});

	const latestLobbyStateRef = useRef<LobbyStateData>(lobbyState);
	const latestDraftSettingsRef = useRef<DraftLobbySettings>(createDraftLobbySettings(lobbyState));

	const [draftLobbySettings, setDraftLobbySettings] = useState<DraftLobbySettings>(
		createDraftLobbySettings(lobbyState)
	);

	const [metaInputs, setMetaInputs] = useState<MetaInputsState>(
		createMetaInputs(lobbyState.metaSettings)
	);

	const inputTimeoutsRef = useRef<Partial<Record<NumericMetaInputKey, number>>>({});
	const savingSettingsRef = useRef(false);
	const saveTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		latestLobbyStateRef.current = lobbyState;
	}, [lobbyState]);

	useEffect(() => {
		latestDraftSettingsRef.current = draftLobbySettings;
	}, [draftLobbySettings]);

	useEffect(() => {
		setDraftLobbySettings(createDraftLobbySettings(lobbyState));
	}, [lobbyState.metaSettings, lobbyState.roleSettings]);

	useEffect(() => {
		setMetaInputs(createMetaInputs(draftLobbySettings.metaSettings));
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

	const getChangedMetaSettings = (current: MetaSettings, next: MetaSettings): Partial<MetaSettings> => {
		const changed: Partial<MetaSettings> = {};

		const assignIfChanged = <K extends keyof MetaSettings>(key: K) => {
			if (current[key] !== next[key]) {
				changed[key] = next[key];
			}
		}

		for (const key of Object.keys(next) as Array<keyof MetaSettings>) {
			assignIfChanged(key);
		}

		return changed;
	};

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

	const getChangedLobbySettings = (current: DraftLobbySettings, next: DraftLobbySettings) => {
		return {
			metaSettings: getChangedMetaSettings(current.metaSettings, next.metaSettings),
			roleSettings: getChangedRoleSettings(current.roleSettings, next.roleSettings)
		};
	};

	const scheduleLobbySettingsSave = (nextSettings: DraftLobbySettings) => {
		if (saveTimeoutRef.current) {
			window.clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = window.setTimeout(() => {
			const currentSettings = createDraftLobbySettings(latestLobbyStateRef.current);
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
					setDraftLobbySettings(createDraftLobbySettings(latestLobbyStateRef.current));
				},
				onTimeout: () => {
					savingSettingsRef.current = false;
				}
			});
		}, SETTINGS_SAVE_DELAY);
	};

	const updateDraftMetaSetting = <K extends keyof MetaSettings>(key: K, value: MetaSettings[K]) => {
		setDraftLobbySettings((prev) => {
			if (prev.metaSettings[key] === value) {
				return prev;
			}

			const nextSettings: DraftLobbySettings = {
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

	const updateDraftRoleSetting = (roleId: number, value: number) => {
		setDraftLobbySettings((prev) => {
			const nextSettings: DraftLobbySettings = {
				...prev,
				roleSettings: {
					...prev.roleSettings,
					[roleId]: Math.max(0, value)
				}
			};

			scheduleLobbySettingsSave(nextSettings);
			return nextSettings;
		});
	};

	const applyRoleSetting = (roleId: number, rawValue: string | number) => {
		const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);

		if (!Number.isFinite(parsed)) {
			return;
		}

		const nextValue = Math.max(0, Math.trunc(parsed));
		updateDraftRoleSetting(roleId, nextValue);
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

	return { draftLobbySettings, metaInputs, applyMetaSetting, updateMetaInput, flushMetaInput, applyRoleSetting };
};