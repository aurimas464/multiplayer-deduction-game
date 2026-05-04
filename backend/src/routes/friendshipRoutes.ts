import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import FriendshipController from "../controllers/friendshipController";

const router = Router();

router.get("/friends", authenticateToken, asyncHandler((req, res) => FriendshipController.getFriends(req, res)));
router.get("/pending", authenticateToken, asyncHandler((req, res) => FriendshipController.getPending(req, res)));
router.get("/pending/exists", authenticateToken, asyncHandler((req, res) => FriendshipController.hasPending(req, res)));
router.get("/sent", authenticateToken, asyncHandler((req, res) => FriendshipController.getSent(req, res)));
router.get("/blocked", authenticateToken, asyncHandler((req, res) => FriendshipController.getBlocked(req, res)));

export default router;