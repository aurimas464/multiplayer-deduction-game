import Popup from "./Popup";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"success">;
	onClose: () => void;
};

const SuccessPopup = ({ popup, onClose }: Props) => {
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
			icon={<CheckCircleIcon/>}
		>
			<div className="popup-content-center-flex">
				{popup.payload.message && <p className="success-message">{popup.payload.message}</p>}
				<CheckCircleIcon className="success-popup-icon" />
			</div>
		</Popup>
	);
};

export default SuccessPopup;
