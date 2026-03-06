import { useEffect, useRef } from "react";
import Popup from "./Popup";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"loading">;
	onClose: () => void;
};

const AUTO_CLOSE_MS = 15000;

const LoadingPopup = ({ popup, onClose }: Props) => {
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		timerRef.current = window.setTimeout(() => {
			popup.payload.onTimeout?.();
			onClose();
		}, AUTO_CLOSE_MS);

		return () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [onClose, popup.payload]);

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position="center"
			width={300}
			height={200}
			minimizable={false}
			closable={false}
			icon={<ArrowPathIcon className="w-5 h-5" />}
		>
			<div className="popup-content-center-flex">
				<ArrowPathIcon className="loading-popup-icon" />
			</div>
		</Popup>
	);
};

export default LoadingPopup;