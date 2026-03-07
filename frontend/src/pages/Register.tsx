import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { authService } from "../services/auth";
import type { RegisterData } from "../types/auth";
import { useTranslation } from "../hooks/useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { errorMapper } from "../utils/errorMapper";
import { ErrorCode } from "../types";
import "../css/auth.css";
import { useUser } from "../contexts/UserContext";

type FieldErrors = Partial<Record<keyof RegisterData, string>> & { general?: string };

const Register = () => {
	const [formData, setFormData] = useState<RegisterData>({
		username: "",
		email: "",
		password: "",
		confirmPassword: "",
	});

	const [errors, setErrors] = useState<FieldErrors>({});

	const navigate = useNavigate();
	const { language } = useLanguage();
	const { t } = useTranslation();

	const { user } = useUser();

	const getFieldLabel = (field: keyof RegisterData) => {
		const key = `pages.register.fields.${String(field)}`;
		const label = t(key, {}, language);
		return label === key ? String(field) : label;
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setErrors({});

		if (formData.password !== formData.confirmPassword) {
			setErrors({
				confirmPassword: t("pages.register.passwordsDontMatch", {}, language),
			});
			return;
		}

		const response = await authService.register(formData);

		if (response?.success) {
			navigate("/login", { state: { fromRegister: true } });
			return;
		}

		const nextErrors: FieldErrors = {};
		const apiErrors = response.errors ?? [];

		for (const err of apiErrors) {
			const field = err.field as keyof RegisterData | undefined;
			const code = err.code as ErrorCode;

			if (field) {
				nextErrors[field] = errorMapper(code, t, language, getFieldLabel(field));
			} else {
				nextErrors.general = errorMapper(code, t, language);
			}
		}

		if (!nextErrors.general && apiErrors.length === 0) {
			nextErrors.general = errorMapper(ErrorCode.UNKNOWN_ERROR, t, language);
		}

		setErrors(nextErrors);
	};

	if (user) return <Navigate to="/home" replace />;

	return (
		<div className="auth-page">
			<div className="auth-container">
				<h1>{t("pages.register.title", {}, language)}</h1>

				{errors.general && <div className="error-message">{errors.general}</div>}

				<form onSubmit={handleSubmit} className="auth-form">
					<div className="form-group">
						{errors.username && <div className="error-message">{errors.username}</div>}
						<input
							type="text"
							id="username"
							name="username"
							value={formData.username}
							onChange={handleChange}
							required
							autoComplete="off"
							placeholder={t("pages.register.fields.username", {}, language)}
						/>
					</div>

					<div className="form-group">
						{errors.email && <div className="error-message">{errors.email}</div>}
						<input
							type="email"
							id="email"
							name="email"
							value={formData.email}
							onChange={handleChange}
							required
							autoComplete="off"
							placeholder={t("pages.register.fields.email", {}, language)}
						/>
					</div>

					<div className="form-group">
						{errors.password && <div className="error-message">{errors.password}</div>}
						<input
							type="password"
							id="password"
							name="password"
							value={formData.password}
							onChange={handleChange}
							required
							autoComplete="new-password"
							placeholder={t("pages.register.fields.password", {}, language)}
						/>
					</div>

					<div className="form-group">
						{errors.confirmPassword && <div className="error-message">{errors.confirmPassword}</div>}
						<input
							type="password"
							id="confirmPassword"
							name="confirmPassword"
							value={formData.confirmPassword}
							onChange={handleChange}
							required
							autoComplete="new-password"
							placeholder={t("pages.register.fields.confirmPassword", {}, language)}
						/>
					</div>

					<button type="submit" className="submit-button">
						{t("pages.register.submit", {}, language)}
					</button>

					<Link to="/login" className="register-link">
						{t("pages.register.hasAccount", {}, language)} {t("pages.login.submit", {}, language)}!
					</Link>
				</form>
			</div>
		</div>
	);
};

export default Register;
