import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import StatisticsController from "../controllers/statisticsController";

const router = Router();

router.get("/games", authenticateToken, asyncHandler((req, res) => StatisticsController.getGameStats(req, res)));
router.get("/users", authenticateToken, asyncHandler((req, res) => StatisticsController.getUserStats(req, res)));

export default router;