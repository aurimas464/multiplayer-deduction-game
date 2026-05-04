import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import config from "../src/config";

// Actual database is mysql, but prisma uses mariadb adapter
const adapter = new PrismaMariaDb({
	host: config.database.host,
	port: config.database.port,
	user: config.database.user,
	password: config.database.password,
	database: config.database.database,
});

const prisma = new PrismaClient({ adapter });

export default prisma;