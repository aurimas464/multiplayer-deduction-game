import dotenv from "dotenv";

dotenv.config({ path: ".env.test", quiet: true });

process.env.NODE_ENV = "test";

if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.DATABASE_URL) {
	throw new Error("Integration tests require TEST_DATABASE_URL or DATABASE_URL. Copy .env.test.example to .env.test and point it at a test database.");
}

const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
if (!/test/i.test(databaseName)) {
	throw new Error(`Refusing to run integration tests against non-test database "${databaseName}". Use a database name containing "test".`);
}

process.env.JWT_SECRET ||= "test-secret";
process.env.PORT ||= "0";
process.env.CORS_ORIGIN ||= "http://localhost:5173";
process.env.COOKIE_DOMAIN ||= "";
process.env.DATABASE_SSL ||= "false";
