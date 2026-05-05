export type CookieConfig = {
	httpOnly: boolean;
	secure: boolean;
	sameSite: "strict" | "lax" | "none";
	domain: string;
	maxAgeDays: number;
}

export type DatabaseConfig = {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
	ssl: boolean;
}

export type AppConfig = {
	baseUrl: string;
	port: number;
	jwtSecret: string;
	cookie: CookieConfig;
	corsOrigin: string;
	database: DatabaseConfig;
}

export type JwtPayload = {
	userId: number;
	playerId: number;
	username: string;
	email: string;
	iat?: number;
	exp?: number;
}
