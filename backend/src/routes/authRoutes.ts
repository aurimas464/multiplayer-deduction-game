import { Router } from "express";
import AuthController from "../controllers/authController";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateRefreshToken, authenticateToken } from "../middleware/authMiddleware";

const router = Router();

router.post("/register", asyncHandler((req, res) => AuthController.register(req, res)));
router.post("/login", asyncHandler((req, res) => AuthController.login(req, res)));
router.post("/refresh", validateRefreshToken, asyncHandler((req, res) => AuthController.refresh(req, res)));
router.post("/logout", validateRefreshToken, asyncHandler((req, res) => AuthController.logout(req, res)));

export default router;