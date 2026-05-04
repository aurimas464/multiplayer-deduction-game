import Popup from "./Popup";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import type { PopupData } from "../../types/popup";
import { useTranslation } from "../../hooks/useTranslation";
import { useRoles } from "../../hooks/useRoles";

type Props = {
	popup: PopupData<"roleReveal">;
	onClose: () => void;
};

const RoleRevealPopup = ({ popup, onClose }: Props) => {
	const { roleKey, roleName, roleAlignment } = popup.payload;
	const { t } = useTranslation();
	const roles = useRoles();
	const role = roles.find((entry) => entry.key === roleKey);
	const resolvedRoleName = role ? t(`roles.keys.${role.key}`) : roleName;
	const resolvedAlignment = role?.alignment ?? roleAlignment;
	const alignmentLabel = resolvedAlignment ? t(`pages.gameLobby.settings.alignments.${resolvedAlignment}`) : "";
	const description = t(`roles.descriptions.${roleKey}`);

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 250}
			height={popup.height ?? 250}
			autoCloseDelay={popup.autoCloseDelay}
			minimizable={true}
			closable={false}
			icon={<UserCircleIcon/>}
		>
			<div className="popup-content-center-flex">
				<div className="role-reveal-content">
					<p className="role-reveal-label">{t("pages.game.roleRevealLabel")}</p>
					<h2 className="role-reveal-name">{resolvedRoleName}</h2>
					<p className="role-reveal-alignment">{alignmentLabel}</p>
					<p className="role-reveal-description">{description}</p>
				</div>
			</div>
		</Popup>
	);
};

export default RoleRevealPopup;
