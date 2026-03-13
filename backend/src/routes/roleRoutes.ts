import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import RoleController from "../controllers/roleController";

const router = Router();

router.get("/get", authenticateToken, asyncHandler((req, res) => RoleController.getRoles(req, res)));

export default router;