import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import UserController from "../controllers/userController";

const router = Router();

router.get("/getme", authenticateToken, asyncHandler((req, res) => UserController.getMe(req, res)));
router.patch("/patch", authenticateToken, asyncHandler((req, res) => UserController.patchUser(req, res)));
router.post("/icons", authenticateToken, asyncHandler((req, res) => UserController.getIcons(req, res)));

export default router;