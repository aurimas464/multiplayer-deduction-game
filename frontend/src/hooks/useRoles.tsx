import { useEffect, useState } from "react";
import { roleService } from "../services/role";
import { errorMapper } from "../utils/errorMapper";
import { useTranslation } from "./useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { usePopup } from "../contexts/PopupContext";
import { ErrorCode, type ErrorCodeType } from "../types";
import type { Role } from "../types/role";

let cachedRoles: Role[] | null = null;
let rolesRequest: Promise<Role[]> | null = null;

const loadRolesOnce = () => {
	if (cachedRoles) return Promise.resolve(cachedRoles);
	if (rolesRequest) return rolesRequest;

	rolesRequest = roleService.getRoles()
		.then((response) => {
			if (response.success) {
				cachedRoles = response.result || [];
				return cachedRoles;
			}

			return Promise.reject(response.errors?.[0]?.code ?? ErrorCode.UNKNOWN_ERROR);
		})
		.finally(() => {
			rolesRequest = null;
		});

	return rolesRequest;
};

export const useRoles = () => {
	const { t } = useTranslation();
	const { language } = useLanguage();
	const { showPopup } = usePopup();
	const [roles, setRoles] = useState<Role[]>([]);

	useEffect(() => {
		let cancelled = false;

		const loadRoles = async () => {
			const loadedRoles = await loadRolesOnce();
			if (!cancelled) setRoles(loadedRoles);
		};

		loadRoles().catch((code: ErrorCodeType) => {
			if (cancelled) return;

			const errorMessage = errorMapper(code, t, language);
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: errorMessage },
				autoCloseDelay: 5000,
			});
		});

		return () => {
			cancelled = true;
		};
	}, [language, showPopup, t]);

	return roles;
};
