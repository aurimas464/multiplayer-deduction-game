import { useCallback, useEffect, useState } from "react";
import Popup from "./Popup";
import { ClockIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"startingTimeout">;
	onClose: () => void;
};

const StartingTimeoutPopup = ({ popup, onClose }: Props) => {
	const getSecondsLeft = useCallback(() => {
		return Math.max(0, Math.ceil((popup.payload.endsAt - Date.now()) / 1000));
	}, [popup.payload.endsAt]);
	const [seconds, setSeconds] = useState(getSecondsLeft);

	useEffect(() => {
		if (popup.payload.endsAt <= Date.now()) {
			onClose();
			return;
		}

		const interval = window.setInterval(() => {
			setSeconds(getSecondsLeft());
		}, 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, [getSecondsLeft, popup.payload.endsAt, onClose]);

	useEffect(() => {
		if (seconds <= 0) {
			onClose();
		}
	}, [seconds, onClose]);

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 300}
			height={popup.height ?? 200}
			minimizable={false}
			closable={false}
			icon={<ClockIcon />}
		>
			<div className="popup-content-center-flex">
				{popup.payload.message && <h3 className="starting-timeout-message">{popup.payload.message}</h3>}
				<div className="starting-timeout-countdown">{seconds}</div>
			</div>
		</Popup>
	);
};

export default StartingTimeoutPopup;
