import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateRefreshToken } from "../middleware/authMiddleware";
import AuthController from "../controllers/authController";

const router = Router();

router.post("/register", asyncHandler((req, res) => AuthController.register(req, res)));
router.post("/login", asyncHandler((req, res) => AuthController.login(req, res)));
router.post("/refresh", validateRefreshToken, asyncHandler((req, res) => AuthController.refresh(req, res)));
router.post("/logout", validateRefreshToken, asyncHandler((req, res) => AuthController.logout(req, res)));

export default router;