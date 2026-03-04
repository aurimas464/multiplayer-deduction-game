import { Router } from 'express';
import UserController from '../controllers/userController';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.get('/getme', authenticateToken, asyncHandler((req, res) => UserController.getMe(req, res)));
router.patch('/update', authenticateToken, asyncHandler((req, res) => UserController.updateUser(req, res)));
router.post('/icons', authenticateToken, asyncHandler((req, res) => UserController.getIcons(req, res)));

export default router;