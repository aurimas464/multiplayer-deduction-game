import type { PopupPosition } from '../../types/popup';
import { useSidebarPosition } from '../../contexts/useSidebarPosition';
import { usePopup } from '../../contexts/PopupContext';
import { Rnd } from 'react-rnd';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import '../../css/popup.css';

type PopupProps = {
	id: string;
	children: React.ReactNode;
	onClose: () => void;
	title: string;
	position: PopupPosition;
	width: number;
	height: number;
	icon?: React.ReactNode;
	autoCloseDelay?: number;
	minimizable?: boolean;
	closable?: boolean;
	closing?: boolean;
}

const BASE_Z_INDEX = 1000;

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

const MINIMIZED_POPUP_WIDTH = 32;
const MINIMIZED_POPUP_HEIGHT = 32;
const MINIMIZED_POPUP_GAP = 8;
const MINIMIZED_POPUP_TOP_POSITION = 120;

const slotToMinimizedPos = (slot: { col: number; row: number }, sidebarRight: number) => {
	const left = sidebarRight + slot.col * (MINIMIZED_POPUP_WIDTH + MINIMIZED_POPUP_GAP);
	const top = MINIMIZED_POPUP_TOP_POSITION + slot.row * (MINIMIZED_POPUP_HEIGHT + MINIMIZED_POPUP_GAP);
	return { top, left };
};

const calculateInitialPosition = (position: PopupPosition, defaultWidth: number, defaultHeight: number): { top: number; left: number } => {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	let top = 0;
	let left = 0;

	if (position === 'center') {
		left = (viewportWidth - defaultWidth) / 2;
		top = (viewportHeight - defaultHeight) / 2;
	} else {
		switch (position) {
			case 'top-left':
				top = 20;
				left = 20;
				break;
			case 'top-right':
				top = 20;
				left = viewportWidth - defaultWidth - 20;
				break;
			case 'bottom-left':
				top = viewportHeight - defaultHeight - 20;
				left = 20;
				break;
			case 'bottom-right':
				top = viewportHeight - defaultHeight - 20;
				left = viewportWidth - defaultWidth - 20;
				break;
			default:
				left = (viewportWidth - defaultWidth) / 2;
				top = (viewportHeight - defaultHeight) / 2;
				break;
		}
	}

	top = Math.max(0, Math.min(top, viewportHeight - defaultHeight));
	left = Math.max(0, Math.min(left, viewportWidth - defaultWidth));

	return { top, left };
};

const getViewportRect = () => {
	const vv = window.visualViewport;
	if (vv) {
		return {
			left: vv.offsetLeft,
			top: vv.offsetTop,
			width: vv.width,
			height: vv.height,
		};
	}
	return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
};

const clampToViewport = (pos: { top: number; left: number }, size: { width: number; height: number }) => {
	const vp = getViewportRect();

	const left = Math.max(vp.left, Math.min(pos.left, vp.left + vp.width - size.width));
	const top = Math.max(vp.top, Math.min(pos.top, vp.top + vp.height - size.height));

	return { top, left };
};

const Popup = ({ 
	id, 
	children, 
	onClose, 
	title, 
	position, 
	width, 
	height, 
	icon = null, 
	autoCloseDelay,
	minimizable = true,
	closable = true,
	closing = false,
}: PopupProps) => {
	// Get sidebar position for minimized popups
	const { right: sidebarRight } = useSidebarPosition();

	const { getMinimizedSlot, releaseMinimizedSlot, allocateZIndex } = usePopup();

	const popupId = id;

	const [isAppearing, setIsAppearing] = useState(true);
	const [isAnimating, setIsAnimating] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);
	const [isClosing, setIsClosing] = useState(false);

	const isClosingRef = useRef(false);
	useEffect(() => {
		isClosingRef.current = isClosing;
	}, [isClosing]);


	const [popupPosition, setPopupPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
	const [popupSize, setPopupSize] = useState<{ width: number; height: number }>({ width, height });
	const [zIndex, setZIndex] = useState<number>(BASE_Z_INDEX);

	const rndRef = useRef<Rnd>(null);

	// Block effects during restore animations
	const isRestoringPosition = useRef(false);

	// Original state to restore to after minimization
	const originalStateRef = useRef<{
		position: { top: number; left: number };
		size: { width: number; height: number };
	}>({
		position: { top: 0, left: 0 },
		size: { width, height },
	});

	const closeTimerRef = useRef<number | null>(null);
	const autoCloseTimerRef = useRef<number | null>(null);
	const autoCloseAtRef = useRef<number | null>(null);
	const openTimerRef = useRef<number | null>(null);

	const dragRef = useRef<{
		pointerId: number | null;
		startX: number;
		startY: number;
		startLeft: number;
		startTop: number;
	}>({
		pointerId: null,
		startX: 0,
		startY: 0,
		startLeft: 0,
		startTop: 0,
	});
	const lastDragPosRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });

	// Allocate z-index for the popup
	useEffect(() => {
		setZIndex(allocateZIndex());
	}, [allocateZIndex]);

	const bringToFront = () => {
		if (isMinimized || isClosing) return;
		setZIndex(allocateZIndex());
	};

	// Open animation
	useEffect(() => {
		openTimerRef.current = window.setTimeout(() => {
			setIsAppearing(false);
			openTimerRef.current = null;
		}, 250);

		return () => {
			if (openTimerRef.current) {
				window.clearTimeout(openTimerRef.current);
				openTimerRef.current = null;
			}
		};
	}, []);

	// Initial position on mount
	useEffect(() => {
		if (isRestoringPosition.current) return;

		const initialPos = calculateInitialPosition(position, width, height);
		setPopupPosition(initialPos);
		setPopupSize({ width, height });

		originalStateRef.current = {
			position: initialPos,
			size: { width, height },
		};
	}, []);

	const handleClose = useCallback(() => {
		if (isClosingRef.current) return;

		// Set ref immediately to avoid race conditions
		isClosingRef.current = true;
		setIsClosing(true);

		// Stop any future auto-close scheduling
		autoCloseAtRef.current = null;

		// Free minimized slot if exists
		releaseMinimizedSlot(popupId);

		// Clear any previous close timer
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}

		onClose();
		return () => {
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		};
	}, [onClose, releaseMinimizedSlot, popupId]);

	useEffect(() => {
		if (!closing) return;
		if (isClosingRef.current) return;

		isClosingRef.current = true;
		setIsClosing(true);
	}, [closing]);

	useEffect(() => {
		if (!autoCloseDelay) return;
		if (isClosing) return;

		// Set a deadline once per popup lifetime
		if (autoCloseAtRef.current === null) {
			autoCloseAtRef.current = Date.now() + autoCloseDelay;
		}

		// Calculate remaining time
		const remaining = autoCloseAtRef.current - Date.now();
		if (remaining <= 0) {
			handleClose();
			return;
		}

		// Clear previous autoClose timer
		if (autoCloseTimerRef.current) {
			window.clearTimeout(autoCloseTimerRef.current);
			autoCloseTimerRef.current = null;
		}

		autoCloseTimerRef.current = window.setTimeout(() => {
			handleClose();
		}, remaining);

		return () => {
			if (autoCloseTimerRef.current) {
				window.clearTimeout(autoCloseTimerRef.current);
				autoCloseTimerRef.current = null;
			}
		};
	}, [autoCloseDelay, isClosing, handleClose]);

	// Minimize popup
	const handleMinimize = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isClosing) return;

		if (!isMinimized) {
			originalStateRef.current = {
				position: popupPosition,
				size: popupSize,
			};

			// Move to available minimized slot
			const slot = getMinimizedSlot(popupId);
			const available = slotToMinimizedPos(slot, sidebarRight);

			setIsAnimating(true);
			setPopupPosition(available);
			setZIndex(BASE_Z_INDEX);

			setTimeout(() => {
				setIsMinimized(true);
				setTimeout(() => setIsAnimating(false), 200);
			}, 50);
		} else {
			handleLocalRestore();
		}
	};
	
	// Restore popup
	const handleLocalRestore = () => {
		if (isClosing) return;

		setIsAnimating(true);
		isRestoringPosition.current = true;

		releaseMinimizedSlot(popupId);

		setZIndex(allocateZIndex());
		setIsMinimized(false);

		const restoredSize = originalStateRef.current.size;
		const restoredPos = clampToViewport(originalStateRef.current.position, restoredSize);

		setPopupSize(restoredSize);
		setPopupPosition(restoredPos);

		rndRef.current?.updateSize({ width: restoredSize.width, height: restoredSize.height });
		rndRef.current?.updatePosition({ x: restoredPos.left, y: restoredPos.top });

		setTimeout(() => {
			setIsAnimating(false);
			isRestoringPosition.current = false;
		}, 300);
	};

	// Keep minimized popups attached to sidebarRight when sidebar moves
	useEffect(() => {
		if (!isMinimized) return;
		if (isRestoringPosition.current) return;
		if (isClosing) return;

		// Mark as dragging (prevents hover expansion)
		setIsDragging(true);

		const slot = getMinimizedSlot(popupId);
		const newPos = slotToMinimizedPos(slot, sidebarRight);

		setPopupPosition(newPos);
		rndRef.current?.updatePosition({ x: newPos.left, y: newPos.top });

		const timeout = setTimeout(() => {
			setIsDragging(false);
		}, 100);

		return () => clearTimeout(timeout);
	}, [sidebarRight, isMinimized, getMinimizedSlot, popupId, isClosing]);

	// Click minimized popup to restore
	const handleMinimizedClick = () => {
		if (isMinimized) handleLocalRestore();
	};

	const handleHeaderPointerDown = (e: React.PointerEvent) => {
		if (isMinimized || isAnimating || isClosing) return;

		// Prevent dragging when interacting with header buttons
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;

		bringToFront();
		setIsDragging(true);

		dragRef.current.pointerId = e.pointerId;
		dragRef.current.startX = e.clientX;
		dragRef.current.startY = e.clientY;
		dragRef.current.startLeft = popupPosition.left;
		dragRef.current.startTop = popupPosition.top;

		lastDragPosRef.current = popupPosition;

		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	};

	const handleHeaderPointerMove = (e: React.PointerEvent) => {
		if (dragRef.current.pointerId !== e.pointerId) return;
		if (!isDragging || isMinimized || isAnimating || isClosing) return;

		const dx = e.clientX - dragRef.current.startX;
		const dy = e.clientY - dragRef.current.startY;

		const elWidth = rndRef.current?.resizableElement?.current?.offsetWidth || popupSize.width;
		const elHeight = rndRef.current?.resizableElement?.current?.offsetHeight || popupSize.height;

		const next = clampToViewport(
			{ top: dragRef.current.startTop + dy, left: dragRef.current.startLeft + dx },
			{ width: elWidth, height: elHeight },
		);

		lastDragPosRef.current = next;

		setPopupPosition(next);
		rndRef.current?.updatePosition({ x: next.left, y: next.top });
	};

	const handleHeaderPointerUp = (e: React.PointerEvent) => {
		if (dragRef.current.pointerId !== e.pointerId) return;

		dragRef.current.pointerId = null;
		setIsDragging(false);

		originalStateRef.current.position = lastDragPosRef.current;
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			if (closable) handleClose();
		}
	};

	const controlledSize = isMinimized ? { width: MINIMIZED_POPUP_WIDTH, height: MINIMIZED_POPUP_HEIGHT } : popupSize;

	return createPortal(
		<Rnd
			ref={rndRef}
			className={[
				'popup',
				isAppearing ? 'appearing' : '',
				isMinimized ? 'minimized' : '',
				isRestoringPosition.current ? 'restoring' : '',
				isAnimating ? 'animating' : '',
				isDragging ? 'dragging' : '',
				isResizing ? 'resizing' : '',
				isClosing ? 'closing' : '',
			]
				.filter(Boolean)
				.join(' ')}
			style={{
				zIndex,
				...(isMinimized
					? {
							top: `${popupPosition.top}px`,
							left: `${popupPosition.left}px`,
					  }
					: {}),
			}}
			position={{ x: popupPosition.left, y: popupPosition.top }}
			size={controlledSize}
			disableDragging={true}
			enableResizing={!isMinimized && !isAnimating && !isClosing}
			minWidth={isMinimized ? MINIMIZED_POPUP_WIDTH : MIN_WIDTH}
			minHeight={isMinimized ? MINIMIZED_POPUP_HEIGHT : MIN_HEIGHT}
			onMouseDown={bringToFront}
			onResizeStart={() => setIsResizing(true)}
			onResizeStop={(_, __, ref, ___, pos) => {
				setIsResizing(false);
				if (isMinimized || isClosing) return;

				const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
				const clampedPos = clampToViewport({ top: pos.y, left: pos.x }, newSize);

				setPopupSize(newSize);
				setPopupPosition(clampedPos);

				rndRef.current?.updateSize({ width: newSize.width, height: newSize.height });
				rndRef.current?.updatePosition({ x: clampedPos.left, y: clampedPos.top });

				originalStateRef.current.size = newSize;
				originalStateRef.current.position = clampedPos;
			}}
		>
			<div className="popup-inner-container" onKeyDown={onKeyDown}>
				<div
					className="popup-header"
					onClick={isMinimized ? handleMinimizedClick : undefined}
					onPointerDown={!isMinimized ? handleHeaderPointerDown : undefined}
					onPointerMove={!isMinimized ? handleHeaderPointerMove : undefined}
					onPointerUp={!isMinimized ? handleHeaderPointerUp : undefined}
				>
					<div className={`popup-icon-container ${icon ? 'visible' : ''}`}>
						{icon ? icon : title ? title.charAt(0).toUpperCase() : ''}
					</div>

					<div className="popup-title">{title}</div>

					<div className="popup-controls">
						{minimizable && !isMinimized && (
							<button
								className="popup-minimize"
								onClick={handleMinimize}
								onTouchEnd={e => {
									e.preventDefault();
									handleMinimize(e as any);
								}}
								disabled={isClosing}
							>
								−
							</button>
						)}

						{closable && (
						<button
							className="popup-close"
							onClick={handleClose}
							onTouchEnd={e => {
								e.preventDefault();
								handleClose();
							}}
							disabled={isClosing}
						>
							×
						</button>
						)}
					</div>
				</div>

				{!isMinimized && <div className="popup-content">{children}</div>}
			</div>
		</Rnd>,
		document.body,
	);
};

export default Popup;
