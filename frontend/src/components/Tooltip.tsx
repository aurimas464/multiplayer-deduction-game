import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../css/tooltip.css";

export type TooltipPosition = "left" | "right" | "top" | "bottom" | "auto";

type TooltipTriggerProps = {
	onMouseEnter?: (e: React.MouseEvent) => void;
	onMouseLeave?: (e: React.MouseEvent) => void;
	[key: string]: any;
};

export type TooltipProps = {
	content: React.ReactNode;
	children: React.ReactElement<TooltipTriggerProps>;
	position?: TooltipPosition;
	showDelay?: number;
	hideDelay?: number;
	width?: string;
	height?: string;
	className?: string;
	containerClassName?: string;
	offset?: number;
	padding?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
	content,
	children,
	position = "right",
	showDelay = 500,
	hideDelay = 1000,
	width = "auto",
	height = "auto",
	className = "",
	containerClassName = "tooltip-container",
	offset = 8,
	padding = 8
}) => {
	const [isVisible, setIsVisible] = useState(false);
	const [shouldRender, setShouldRender] = useState(false);

	const [calculatedPosition, setCalculatedPosition] = useState<Exclude<TooltipPosition, "auto">>("right");
	const [coords, setCoords] = useState<{ left: number; top: number }>({
		left: 0,
		top: 0
	});

	const tooltipRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hideDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearTimer = (t: { current: ReturnType<typeof setTimeout> | null }) => {
		if (t.current) {
			clearTimeout(t.current);
			t.current = null;
		}
	};

	// To make sure it doesn"t go off screen
	const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

	const computeBestPosition = (): Exclude<TooltipPosition, "auto"> => {
		if (!containerRef.current || !tooltipRef.current) return "right";

		const trigger = containerRef.current.getBoundingClientRect();
		const tip = tooltipRef.current.getBoundingClientRect();

		const vw = window.innerWidth;
		const vh = window.innerHeight;

		const spaces = {
			left: trigger.left,
			right: vw - trigger.right,
			top: trigger.top,
			bottom: vh - trigger.bottom
		};

		const required = {
			left: tip.width + offset,
			right: tip.width + offset,
			top: tip.height + offset,
			bottom: tip.height + offset
		};

		const scores = {
			right: spaces.right / required.right,
			left: spaces.left / required.left,
			top: spaces.top / required.top,
			bottom: spaces.bottom / required.bottom
		};

		const positions: Array<Exclude<TooltipPosition, "auto">> = [
			"right",
			"left",
			"top",
			"bottom"
		];

		let best: Exclude<TooltipPosition, "auto"> = "right";
		let bestScore = scores.right;

		for (const p of positions) {
			if (scores[p] > bestScore) {
				bestScore = scores[p];
				best = p;
			}
		}

		return best;
	};

	const computeCoordsForPosition = (pos: Exclude<TooltipPosition, "auto">) => {
		if (!containerRef.current || !tooltipRef.current) return;

		const trigger = containerRef.current.getBoundingClientRect();
		const tip = tooltipRef.current.getBoundingClientRect();

		const vw = window.innerWidth;
		const vh = window.innerHeight;

		const triggerCenterX = trigger.left + trigger.width / 2;
		const triggerCenterY = trigger.top + trigger.height / 2;

		let left = 0;
		let top = 0;

		switch (pos) {
			case "right":
				left = trigger.right + offset;
				top = triggerCenterY - tip.height / 2;
				break;
			case "left":
				left = trigger.left - tip.width - offset;
				top = triggerCenterY - tip.height / 2;
				break;
			case "top":
				left = triggerCenterX - tip.width / 2;
				top = trigger.top - tip.height - offset;
				break;
			case "bottom":
				left = triggerCenterX - tip.width / 2;
				top = trigger.bottom + offset;
				break;
		}

		left = clamp(left, padding, vw - tip.width - padding);
		top = clamp(top, padding, vh - tip.height - padding);

		setCoords({ left, top });
	};

	const finalPosition: Exclude<TooltipPosition, "auto"> = position === "auto" ? calculatedPosition : position;

	useEffect(() => {
		return () => {
			clearTimer(showTimeoutRef);
			clearTimer(hideTimeoutRef);
			clearTimer(hideDelayRef);
		};
	}, []);

	useEffect(() => {
		if (!shouldRender) return;

		// Schedule a reflow to compute coords after render
		const raf = requestAnimationFrame(() => {
			if (position === "auto") {
				const best = computeBestPosition();
				setCalculatedPosition(best);
				computeCoordsForPosition(best);
			} else {
				computeCoordsForPosition(position);
			}
		});

		return () => cancelAnimationFrame(raf);
	}, [shouldRender, content, width, height, offset, position]);

	const handleShow = () => {
		clearTimer(hideTimeoutRef);
		clearTimer(hideDelayRef);

		setShouldRender(true);

		clearTimer(showTimeoutRef);
		showTimeoutRef.current = setTimeout(() => {
			setIsVisible(true);
			showTimeoutRef.current = null;
		}, showDelay);
	};

	const handleHide = () => {
		clearTimer(showTimeoutRef);

		clearTimer(hideDelayRef);
		hideDelayRef.current = setTimeout(() => {
			setIsVisible(false);

			clearTimer(hideTimeoutRef);
			hideTimeoutRef.current = setTimeout(() => {
				setShouldRender(false);
				hideTimeoutRef.current = null;
			}, 500);

			hideDelayRef.current = null;
		}, hideDelay);
	};


	const triggerProps = children.props as TooltipTriggerProps;

	const child = React.cloneElement(children, {
		onMouseEnter: (e: React.MouseEvent) => {
			handleShow();
			triggerProps.onMouseEnter?.(e);
		},
		onMouseLeave: (e: React.MouseEvent) => {
			handleHide();
			triggerProps.onMouseLeave?.(e);
		}
	});

	return (
		<div className={containerClassName} ref={containerRef}>
			{child}

			{shouldRender &&
				createPortal(
					<div
						ref={tooltipRef}
						className={`tooltip tooltip-${finalPosition} ${className} ${isVisible ? "visible" : ""}`}
						style={{
							width,
							height,
							position: "fixed",
							left: `${coords.left}px`,
							top: `${coords.top}px`
						}}
						onMouseEnter={handleShow}
						onMouseLeave={handleHide}
						role="tooltip"
					>
						{content}
						<div
							className={`tooltip-arrow tooltip-arrow-${finalPosition}`}
						/>
					</div>,
					document.body
				)}
		</div>
	);
};