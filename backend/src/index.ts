import express, { Express } from "express";
import { createServer } from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import roleRoutes from "./routes/roleRoutes";
import friendshipRoutes from "./routes/friendshipRoutes";
import directChatRoutes from "./routes/chatRoutes";
import notesRoutes from "./routes/noteRoutes";
import statisticsRoutes from "./routes/statisticsRoutes";

import { errorMiddleware } from "./middleware/errorMiddleware";
import { WSController } from "./websocket/WSController";

import prisma from "../prisma/client";
import { ErrorCode } from "./types/index";
import config from "./config";
import { seed } from "../prisma/seed";
import GameService from "./services/gameService";

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

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/friendships", friendshipRoutes);
app.use("/api/chats", directChatRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/statistics", statisticsRoutes);
app.use(errorMiddleware);

const wss = new WSController(server, config);

async function startServer(): Promise<void> {
	try {
		await prisma.$connect();
		await seed();
		await GameService.cancelAllNonFinishedGames();

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
let isShuttingDown = false;
async function shutdown(): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	try {
		await wss.close();

		await new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) reject(err);
				else resolve();
			});
		});

		await prisma.$disconnect();
		process.exit(0);
	} catch (error) {
		console.error("Shutdown failed:", error);
		process.exit(1);
	}
}

process.on("SIGINT", () => {
	void shutdown();
});

process.on("SIGTERM", () => {
	void shutdown();
});

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