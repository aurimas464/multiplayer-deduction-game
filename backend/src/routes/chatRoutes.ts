import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import ChatController from "../controllers/chatController";

const router = Router();

router.get("/direct", authenticateToken, asyncHandler((req, res) => ChatController.getDirectChats(req, res)));
router.get("/game", authenticateToken, asyncHandler((req, res) => ChatController.getGameChats(req, res)));
router.get("/direct/unread/exists", authenticateToken, asyncHandler((req, res) => ChatController.hasUnreadDirect(req, res)));
router.get("/direct/:chatId/messages", authenticateToken, asyncHandler((req, res) => ChatController.getDirectChatMessages(req, res)));
router.get("/game/:gameId/messages", authenticateToken, asyncHandler((req, res) => ChatController.getGameChatMessages(req, res)));

export default router;