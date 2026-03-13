import Popup from "./Popup";
import { XCircleIcon } from "@heroicons/react/24/solid";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"error">;
	onClose: () => void;
};

const ErrorPopup = ({ popup, onClose }: Props) => {
	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "top-right"}
			width={popup.width ?? 300}
			height={popup.height ?? 200}
			autoCloseDelay={popup.autoCloseDelay}
			minimizable={false}
			closable={false}
			icon={<XCircleIcon/>}
		>
			<div className="popup-content-center-flex">
				{popup.payload.message && <p className="error-message">{popup.payload.message}</p>}
				<XCircleIcon className="error-popup-icon" />
			</div>
		</Popup>
	);
};

export default ErrorPopup;
