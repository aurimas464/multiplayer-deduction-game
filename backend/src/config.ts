import dotenv from "dotenv";
import { AppConfig } from "./types/config";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("No DATABASE_URL environment variable found");
}

const url = new URL(databaseUrl);

const defaultDatabaseSsl = process.env.NODE_ENV === "production" || Boolean(process.env.WEBSITE_INSTANCE_ID);
const databaseSslEnv = process.env.DATABASE_SSL ?? url.searchParams.get("ssl");
const databaseSsl = databaseSslEnv === "true" ? true : databaseSslEnv === "false" ? false : defaultDatabaseSsl;

const config: AppConfig = {
	baseUrl: process.env.BASE_URL || "http://localhost",
	port: parseInt(process.env.PORT || "", 10),
	jwtSecret: process.env.JWT_SECRET || "",
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		domain: process.env.COOKIE_DOMAIN || "",
		maxAgeDays: 7
	},
	corsOrigin: process.env.CORS_ORIGIN || "",
	database: {
		host: url.hostname,
		port: url.port ? Number(url.port) : 3306,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database: url.pathname.replace(/^\//, ""),
		ssl: databaseSsl,
	},
};

export default config;
