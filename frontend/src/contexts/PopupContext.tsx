import React, { createContext, useCallback, useContext, useRef, useState, useMemo } from "react";
import type { PopupType, PopupData } from "../types/popup";

export type ShowPopupInput<T extends PopupType = PopupType> = Omit<PopupData<T>, "id">;

type PopupContextType = {
	popups: PopupData[];
	showPopup: <T extends PopupType>(popup: ShowPopupInput<T>) => string;
	closePopup: (id: string) => void;
	bringPopupToFront: (id: string) => boolean;
	registerBringToFrontHandler: (id: string, handler: () => void) => () => void;
	getMinimizedSlot: (popupId: string) => { col: number; row: number };
	releaseMinimizedSlot: (popupId: string) => void;
	allocateZIndex: () => number;
}

// Starts as undefined so that cases where app is used without context throws an error
const PopupContext = createContext<PopupContextType | undefined>(undefined);

const BASE_Z_INDEX = 1000;
const MINIMIZED_POPUP_HEIGHT = 32;
const MINIMIZED_POPUP_GAP = 8;
const MINIMIZED_POPUP_TOP_POSITION = 120;

const getMaxRowsPerColumn = () => {
	const viewportHeight = window.innerHeight;
	return Math.max(
		1,
		Math.floor(
			(viewportHeight - MINIMIZED_POPUP_TOP_POSITION - MINIMIZED_POPUP_GAP) /
			(MINIMIZED_POPUP_HEIGHT + MINIMIZED_POPUP_GAP),
		),
	);
};

export const PopupProvider = ({ children }: { children: React.ReactNode }) => {
	const [popups, setPopups] = useState<PopupData[]>([]);
	const counter = useRef(0);

	const minimizedSlotsRef = useRef<Record<string, { col: number; row: number }>>({});
	const bringToFrontHandlersRef = useRef<Record<string, () => void>>({});
	const zCounterRef = useRef<number>(BASE_Z_INDEX);

	const allocateZIndex = useCallback(() => {
		zCounterRef.current += 1;
		return zCounterRef.current;
	}, []);

	// Close popup by id
	const closePopup = useCallback((id: string) => {
		// Free minimized slot if exists
		if (minimizedSlotsRef.current[id]) {
			delete minimizedSlotsRef.current[id];
		}

		if (bringToFrontHandlersRef.current[id]) {
			delete bringToFrontHandlersRef.current[id];
		}

		setPopups(prev => prev.map(p => (p.id === id ? { ...p, closing: true } : p)));
		window.setTimeout(() => {
			setPopups(prev => prev.filter(p => p.id !== id));
		}, 250);
	}, []);

	const registerBringToFrontHandler = useCallback((id: string, handler: () => void) => {
		bringToFrontHandlersRef.current[id] = handler;

		return () => {
			if (bringToFrontHandlersRef.current[id] === handler) {
				delete bringToFrontHandlersRef.current[id];
			}
		};
	}, []);

	const bringPopupToFront = useCallback((id: string) => {
		const handler = bringToFrontHandlersRef.current[id];

		if (!handler) return false;

		handler();
		return true;
	}, []);

	// Slot allocation (deterministic)
	const getMinimizedSlot = useCallback((popupId: string) => {
		const existing = minimizedSlotsRef.current[popupId];
		if (existing) return existing;

		const maxRows = getMaxRowsPerColumn();
		const occupied = new Set(Object.values(minimizedSlotsRef.current).map(s => `${s.col},${s.row}`));

		let col = 0;

		while (true) {
			for (let row = 0; row < maxRows; row++) {
				const key = `${col},${row}`;
				if (occupied.has(key)) continue;

				const slot = { col, row };
				minimizedSlotsRef.current = { ...minimizedSlotsRef.current, [popupId]: slot };
				return slot;
			}
			col++;
		}
	}, []);

	const releaseMinimizedSlot = useCallback((popupId: string) => {
		if (!minimizedSlotsRef.current[popupId]) return;
		delete minimizedSlotsRef.current[popupId];
	}, []);

	// Show popup
	const showPopup = useCallback(<T extends PopupType>(popupData: ShowPopupInput<T>) => {
		counter.current += 1;
		const id = `popup-${Date.now()}-${counter.current}`;

		const newPopup: PopupData<T> = { ...popupData, id };
		setPopups(prev => [...prev, newPopup]);

		return id;
	}, []);

	// Exposed context value
	const value = useMemo<PopupContextType>(() => ({
		popups,
		showPopup,
		closePopup,
		bringPopupToFront,
		registerBringToFrontHandler,
		getMinimizedSlot,
		releaseMinimizedSlot,
		allocateZIndex,
	}), [popups, showPopup, closePopup, bringPopupToFront, registerBringToFrontHandler, getMinimizedSlot, releaseMinimizedSlot, allocateZIndex]);

	return <PopupContext.Provider value={value}>{children}</PopupContext.Provider>;
};

// Hook for accessing this context
export const usePopup = () => {
	const context = useContext(PopupContext);
	if (context === undefined) {
		throw new Error("No user context found!");
	}
	return context;
};
