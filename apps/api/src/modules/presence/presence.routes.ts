import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { PresenceController } from "./presence.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Get presence for all workspace members (REST snapshot for initial load)
router.get("/", PresenceController.getWorkspacePresence);

// Get presence for a single user
router.get("/:userId", PresenceController.getUserPresence);

export default router;
