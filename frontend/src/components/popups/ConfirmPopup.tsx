import { useRef } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import Popup from "./Popup";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"confirm">;
	onClose: () => void;
};

const ConfirmPopup = ({ popup, onClose }: Props) => {
	const { t } = useTranslation();

	const actionLock = useRef(false);

	const handleConfirm = async () => {
		if (actionLock.current) return;

		actionLock.current = true;
		await popup.payload.onConfirm();
		onClose();
	};

	const handleCancel = () => {
		popup.payload.onCancel?.();
		onClose();
	};

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 400}
			height={popup.height ?? 250}
			autoCloseDelay={popup.autoCloseDelay}
			minimizable={false}
			closable={true}
			icon={<ExclamationTriangleIcon />}
		>
			<div className="confirm-popup-content">
				<div className="confirm-popup-body">
					{popup.payload.message && <p className="confirm-message">{popup.payload.message}</p>}

					<ExclamationTriangleIcon className="confirm-popup-icon" />
				</div>

				<div className="confirm-actions">
					<button className="custom-button" onClick={handleConfirm}>
						{t("common.yes")}
					</button>

					<button className="custom-button" onClick={handleCancel}>
						{t("common.no")}
					</button>
				</div>
			</div>
		</Popup>
	);
};

export default ConfirmPopup;