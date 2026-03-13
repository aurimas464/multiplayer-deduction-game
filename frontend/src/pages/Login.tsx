import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { authService } from "../services/auth";
import { type LoginCredentials } from "../types/auth";
import { useTranslation } from "../hooks/useTranslation";
import { useLanguage } from "../contexts/LanguageContext";
import { errorMapper } from "../utils/errorMapper";
import "../css/auth.css";
import { useUser } from "../contexts/UserContext";

const Login = () => {
	const [formData, setFormData] = useState<LoginCredentials>({
		login: "",
		password: "",
	});

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData(prev => ({
			...prev,
			[name]: value,
		}));
	};

	const navigate = useNavigate();
	const { language } = useLanguage();
	const { t } = useTranslation();
	const location = useLocation();
	const { user, setUser } = useUser();

	const [errorMessage, setError] = useState<string>("");
	const [successMessage, setSuccessMessage] = useState<string>("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSuccessMessage("");

		const response = await authService.login(formData);

		if (response.success) {

			if (response.result?.user) {
				setUser(response.result.user);
			}

			navigate("/home", { replace: true });
			return;
		}

		const code = response.errors?.[0]?.code;
		setError(errorMapper(code, t, language));
	};

	useEffect(() => {
		const state = location.state as { fromRegister?: boolean } | null;
		if (state?.fromRegister) {
			setSuccessMessage(t("pages.login.registrationSuccess", {}, language));
		}
	}, [location, t]);

	if (user) return <Navigate to="/home" replace />;

	return (
		<div className="auth-page">
			<div className="auth-container">
				<h1>{t("pages.login.title", {}, language)}</h1>

				{successMessage && <div className="success-message">{successMessage}</div>}
				{errorMessage && <div className="error-message">{errorMessage}</div>}

				<form onSubmit={handleSubmit} className="auth-form">
					<div className="form-group">
						<input
							type="text"
							id="login"
							name="login"
							value={formData.login}
							onChange={handleChange}
							required
							autoComplete="off"
							placeholder={t("pages.login.fields.login", {}, language)}
						/>
					</div>
					<div className="form-group">
						<input
							type="password"
							id="password"
							name="password"
							value={formData.password}
							onChange={handleChange}
							required
							autoComplete="current-password"
							placeholder={t("pages.login.fields.password", {}, language)}
						/>
					</div>
					<button type="submit" className="submit-button">
						{t("pages.login.submit", {}, language)}
					</button>

					<Link to="/register" className="register-link">
						{t("pages.login.noAccount", {}, language)} {t("pages.login.register", {}, language)}!
					</Link>
				</form>
			</div>
		</div>
	);
};

export default Login;
