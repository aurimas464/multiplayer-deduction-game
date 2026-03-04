import express, { Express } from "express";
import { createServer } from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import { errorMiddleware } from "./middleware/errorMiddleware";
import { GameWebSocketServer } from "./websocket/WebSocketServer";

import prisma from "./prisma";
import { ErrorCode } from "./types/index";
import config from "./config";

const app: Express = express();
const server = createServer(app);

app.use(
	cors({
		origin: config.corsOrigin,
		credentials: true,
	})
);

app.use(express.json());
app.use(cookieParser());
app.use((req, _, next) => {
	if (process.env.NODE_ENV == "development") {
		console.log(`${req.method} ${req.originalUrl} ${JSON.stringify(req?.query) ?? ""} ${JSON.stringify(req?.body) ?? ""}`);
	}
	next();
});

app.use(
	rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 1000,
		message: {
			success: false,
			errors: [{ code: ErrorCode.RATE_LIMIT_EXCEEDED }],
		},
	})
);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use(errorMiddleware);

const wss = new GameWebSocketServer(server, config);

async function startServer(): Promise<void> {
	try {
		await prisma.$connect();

		const PORT = config.port;
		server.listen(PORT, () => {
			console.log(`Server running on http://localhost:${PORT}`);
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

// Prisma shutdown handler
async function shutdown() {
	try {
		wss.close();
		await prisma.$disconnect();
		server.close(() => process.exit(0));
	} catch {
		process.exit(1);
	}
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Unhandled rejection handler
process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection:", error);
	process.exit(1);
});

// Uncaught exception handler
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	process.exit(1);
});

startServer();