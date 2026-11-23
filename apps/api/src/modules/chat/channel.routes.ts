import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { ChannelController } from "./channel.controller";

import { ReadReceiptController } from "./receipt.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

// List all channels visible to the requesting user (public + their private/DMs)
router.get("/", ChannelController.listForUser);

// Get a single channel (access-guarded for PRIVATE/DIRECT)
router.get("/:channelId", ChannelController.getOne);

// Create a public or private channel
router.post(
  "/",
  requirePermission(PERMISSIONS.CHANNEL_CREATE),
  ChannelController.create
);

// Update a channel (rename/description)
router.put(
  "/:channelId",
  requirePermission(PERMISSIONS.CHANNEL_UPDATE),
  ChannelController.update
);

// Archive a channel (soft-delete)
router.post(
  "/:channelId/archive",
  requirePermission(PERMISSIONS.CHANNEL_UPDATE),
  ChannelController.archive
);

// Delete a channel permanently
router.delete(
  "/:channelId",
  requirePermission(PERMISSIONS.CHANNEL_DELETE),
  ChannelController.remove
);

// ---------------------------------------------------------------------------
// Channel Membership
// ---------------------------------------------------------------------------

router.post(
  "/:channelId/members",
  requirePermission(PERMISSIONS.MEMBER_INVITE),
  ChannelController.addMember
);

router.delete(
  "/:channelId/members/:userId",
  requirePermission(PERMISSIONS.MEMBER_REMOVE),
  ChannelController.removeMember
);

// ---------------------------------------------------------------------------
// Layer 5 — Read Receipts
// ---------------------------------------------------------------------------

router.post("/:channelId/read", ReadReceiptController.markAsRead);
router.get("/:channelId/unread-count", ReadReceiptController.getUnreadCount);

// ---------------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------------

// Find or create a DM channel between the requesting user and a target user
router.post("/dm", ChannelController.createOrGetDM);

export default router;
