import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticateToken } from "../middleware/authMiddleware";
import NoteController from "../controllers/noteController";

const router = Router();

router.get("/get", authenticateToken, asyncHandler((req, res) => NoteController.getAllNotes(req, res)));
router.get("/get/:id", authenticateToken, asyncHandler((req, res) => NoteController.getNoteById(req, res)));
router.post("/create", authenticateToken, asyncHandler((req, res) => NoteController.createNote(req, res)));
router.patch("/update/:id", authenticateToken, asyncHandler((req, res) => NoteController.updateNote(req, res)));
router.delete("/delete/:id", authenticateToken, asyncHandler((req, res) => NoteController.deleteNote(req, res)));

export default router;