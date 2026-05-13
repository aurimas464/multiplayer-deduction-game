
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

if (process.env.NODE_ENV === "test") {
	dotenv.config({ path: ".env.test" });
}

dotenv.config();

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: databaseUrl,
	},
});
