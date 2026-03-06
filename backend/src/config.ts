import dotenv from "dotenv";
import { AppConfig } from "./types/config";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("No DATABASE_URL environment variable found");
}

const url = new URL(databaseUrl);

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
	},
};

export default config;
