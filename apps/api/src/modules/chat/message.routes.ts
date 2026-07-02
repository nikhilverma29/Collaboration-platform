import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { MessageController } from "./message.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// List messages in a channel (pass channelId + optional pagination as query params)
router.get("/", MessageController.list);

// Send a message (or thread reply if body contains parentId)
router.post("/", MessageController.send);

// Edit a message (author-only, enforced in service)
router.put("/:messageId", MessageController.edit);

// Soft-delete a message (author or admin)
router.delete("/:messageId", MessageController.remove);

// ---------------------------------------------------------------------------
// Layer 4 — Threads & Reactions
// ---------------------------------------------------------------------------

router.get("/:messageId/replies", MessageController.listReplies);
router.post("/:messageId/reactions", MessageController.toggleReaction);

// Ephemeral typing indicator
router.post("/typing/start", MessageController.typingStart);
router.post("/typing/stop", MessageController.typingStop);

export default router;
