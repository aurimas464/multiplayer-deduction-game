import Popup from "./Popup";
import { InformationCircleIcon } from "@heroicons/react/24/solid";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"info">;
	onClose: () => void;
};

const InfoPopup = ({ popup, onClose }: Props) => {
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
			icon={<InformationCircleIcon/>}
		>
			<div className="popup-content-center-flex">
				{popup.payload.message && <p className="info-message">{popup.payload.message}</p>}
				<InformationCircleIcon className="info-popup-icon" />
			</div>
		</Popup>
	);
};

export default InfoPopup;