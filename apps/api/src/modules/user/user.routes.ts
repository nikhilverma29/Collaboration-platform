import { Router } from "express";
import { UserController } from "./user.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// Profile
router.get("/me", UserController.getProfile);
router.put("/me", UserController.updateProfile);
router.put("/me/avatar", UserController.updateAvatar);
router.put("/me/password", UserController.changePassword);

// Sessions
router.get("/sessions", UserController.listSessions);
router.delete("/sessions", UserController.revokeAllOtherSessions);
router.delete("/sessions/:id", UserController.revokeSession);

export default router;
