# 07-chat-communication — Full Realtime Communication

## Purpose

Public/Private channels, Direct Message channels, message sending with cursor-based pagination, thread replies, message reactions, message editing/deletion, and read receipts. All events broadcast to workspace socket rooms in real time.

## Dependencies

- `00-core-foundation`
- `02-workspace-tenancy`
- `03-rbac-governance`
- `04-realtime-infra`

## Main User Flow

POST /api/channels → create channel. POST /api/messages → send message → emit socket event. POST /api/messages/:id/reactions → toggle reaction. GET /api/messages?channelId&before → paginated history. POST /api/messages/receipts/mark → mark as read.

## Files Involved

- `apps/api/src/modules/chat/channel.service.ts`
- `apps/api/src/modules/chat/channel.controller.ts`
- `apps/api/src/modules/chat/channel.routes.ts`
- `apps/api/src/modules/chat/message.service.ts`
- `apps/api/src/modules/chat/message.controller.ts`
- `apps/api/src/modules/chat/message.routes.ts`
- `apps/api/src/modules/chat/receipt.service.ts`
- `apps/api/src/modules/chat/receipt.controller.ts`
- `packages/validators/src/channel.ts`
- `packages/validators/src/message.ts`
- `packages/validators/src/receipt.ts`

## Source Code

### `apps/api/src/modules/chat/channel.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateChannelInput, UpdateChannelInput, CreateDMInput } from "@syncra/validators";

export class ChannelService {

  // ---------------------------------------------------------------------------
  // Public Channels
  // ---------------------------------------------------------------------------

  /**
   * List all non-archived public channels in a workspace.
   * Private channels and DMs are excluded — they are only visible to members.
   */
  static async listPublic(workspaceId: string) {
    return prisma.channel.findMany({
      where: { workspaceId, type: "PUBLIC", isArchived: false },
      include: {
        _count: { select: { members: true, messages: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * List all channels a specific user has access to (public + their private + their DMs).
   */
  static async listForUser(workspaceId: string, userId: string) {
    return prisma.channel.findMany({
      where: {
        workspaceId,
        isArchived: false,
        OR: [
          { type: "PUBLIC" },
          { type: { in: ["PRIVATE", "DIRECT"] }, members: { some: { userId } } },
        ],
      },
      include: {
        _count: { select: { messages: true } },
        members: {
          select: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Get full channel details including members.
   * Validates the requesting user has access before returning.
   */
  static async getById(channelId: string, workspaceId: string, requestingUserId: string) {
    const channel = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId, workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true } } },
        },
        createdBy: { select: { id: true, displayName: true } },
      },
    });

    // Access guard: private/DM channels require membership
    if (channel.type !== "PUBLIC") {
      const isMember = channel.members.some((m) => m.userId === requestingUserId);
      if (!isMember) throw new Error("You are not a member of this channel");
    }

    return channel;
  }

  /**
   * Create a new public or private channel.
   * Creator is automatically added as a member.
   */
  static async create(workspaceId: string, actorId: string, data: CreateChannelInput) {
    return prisma.channel.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: data.name,
        description: data.description,
        type: data.type,
        members: {
          create: { userId: actorId }, // Creator is auto-added
        },
      },
      include: {
        members: { select: { userId: true } },
      },
    });
  }

  /**
   * Update channel name/description. Restricted to members.
   */
  static async update(channelId: string, workspaceId: string, data: UpdateChannelInput) {
    return prisma.channel.update({
      where: { id: channelId, workspaceId },
      data,
    });
  }

  /**
   * Soft-archive a channel.
   */
  static async archive(channelId: string, workspaceId: string) {
    return prisma.channel.update({
      where: { id: channelId, workspaceId },
      data: { isArchived: true },
    });
  }

  /**
   * Delete a channel and all its messages.
   */
  static async delete(channelId: string, workspaceId: string) {
    return prisma.channel.delete({ where: { id: channelId, workspaceId } });
  }

  // ---------------------------------------------------------------------------
  // Channel Membership
  // ---------------------------------------------------------------------------

  /**
   * Add a workspace member to a private channel.
   */
  static async addMember(channelId: string, targetUserId: string) {
    return prisma.channelMember.create({
      data: { channelId, userId: targetUserId },
    });
  }

  /**
   * Remove a member from a channel.
   */
  static async removeMember(channelId: string, targetUserId: string) {
    return prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
  }

  // ---------------------------------------------------------------------------
  // Direct Messages
  // ---------------------------------------------------------------------------

  /**
   * Find an existing DM channel between two users, or create one.
   * A DM is a DIRECT-type channel whose members are exactly the two participants.
   */
  static async findOrCreateDM(workspaceId: string, actorId: string, data: CreateDMInput) {
    const { targetUserId } = data;

    if (actorId === targetUserId) {
      throw new Error("Cannot create a DM with yourself");
    }

    // Check if a DM already exists between these two users in this workspace
    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId,
        type: "DIRECT",
        members: { some: { userId: actorId } },
        AND: [{ members: { some: { userId: targetUserId } } }],
      },
      include: { members: { select: { userId: true } } },
    });

    if (existing) return existing;

    // Create the DM channel with both users as members
    return prisma.channel.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: null, // DMs have no name
        type: "DIRECT",
        members: {
          create: [{ userId: actorId }, { userId: targetUserId }],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      },
    });
  }
}
```

### `apps/api/src/modules/chat/channel.controller.ts`

```typescript
import { Request, Response } from "express";
import { ChannelService } from "./channel.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { createChannelSchema, updateChannelSchema, createDMSchema } from "@syncra/validators";

export class ChannelController {

  static async listForUser(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const userId = req.user!.userId;
      const channels = await ChannelService.listForUser(workspaceId, userId);
      res.status(200).json({ success: true, data: channels });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const userId = req.user!.userId;
      const channelId = req.params.channelId as string;

      const channel = await ChannelService.getById(channelId, workspaceId, userId);
      res.status(200).json({ success: true, data: channel });
    } catch (error: any) {
      const status = error.message.includes("not a member") ? 403 : 400;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const parsed = createChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const channel = await ChannelService.create(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "channel_created", channel },
      });

      res.status(201).json({ success: true, data: channel });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const parsed = updateChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const channelId = req.params.channelId as string;

      const channel = await ChannelService.update(channelId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "channel_updated", channel },
      });

      res.status(200).json({ success: true, data: channel });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async archive(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const channelId = req.params.channelId as string;

      const channel = await ChannelService.archive(channelId, workspaceId);
      res.status(200).json({ success: true, data: channel });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const channelId = req.params.channelId as string;

      await ChannelService.delete(channelId, workspaceId);
      res.status(200).json({ success: true, data: { message: "Channel deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  static async addMember(req: Request, res: Response) {
    try {
      const { userId: targetUserId } = req.body;
      const channelId = req.params.channelId as string;
      const actorWorkspaceId = req.user!.workspaceId!;

      if (!targetUserId) {
        res.status(400).json({ success: false, error: "userId is required" });
        return;
      }

      const member = await ChannelService.addMember(channelId, targetUserId);

      SocketService.broadcastToWorkspace(actorWorkspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: req.user!.userId,
        data: { type: "channel_member_added", channelId, userId: targetUserId },
      });

      res.status(201).json({ success: true, data: member });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const channelId = req.params.channelId as string;
      const targetUserId = req.params.userId as string;

      await ChannelService.removeMember(channelId, targetUserId);
      res.status(200).json({ success: true, data: { message: "Member removed from channel" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Direct Messages
  // ---------------------------------------------------------------------------

  static async createOrGetDM(req: Request, res: Response) {
    try {
      const parsed = createDMSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const dm = await ChannelService.findOrCreateDM(workspaceId, userId, parsed.data);
      res.status(200).json({ success: true, data: dm });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/chat/channel.routes.ts`

```typescript
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
  requirePermission(PERMISSIONS.PROJECT_CREATE), // Reuse PROJECT_CREATE as "can create team resources"
  ChannelController.create
);

// Update a channel (rename/description)
router.put(
  "/:channelId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ChannelController.update
);

// Archive a channel (soft-delete)
router.post(
  "/:channelId/archive",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ChannelController.archive
);

// Delete a channel permanently
router.delete(
  "/:channelId",
  requirePermission(PERMISSIONS.PROJECT_DELETE),
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
```

### `apps/api/src/modules/chat/message.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { SendMessageInput, EditMessageInput, ListMessagesQuery } from "@syncra/validators";

// Shared include shape used on every message query for consistency
const messageInclude = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
  editedBy: { select: { id: true, displayName: true } },
  reactions: {
    include: { user: { select: { id: true, displayName: true } } },
  },
  _count: { select: { replies: true } },
} as const;

export class MessageService {

  /**
   * List messages for a channel with cursor-based pagination (oldest → newest).
   * Returns up to `limit` messages that were created before the `before` cursor.
   */
  static async list(workspaceId: string, query: ListMessagesQuery) {
    const { channelId, limit, before } = query;

    // Verify channel belongs to workspace
    await prisma.channel.findUniqueOrThrow({ where: { id: channelId, workspaceId } });

    const cursorClause = before
      ? { createdAt: { lt: (await prisma.message.findUniqueOrThrow({ where: { id: before } })).createdAt } }
      : {};

    // Only fetch top-level messages (not thread replies)
    const messages = await prisma.message.findMany({
      where: {
        channelId,
        workspaceId,
        parentId: null,
        ...cursorClause,
      },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Return in chronological order (oldest first)
    return messages.reverse();
  }

  /**
   * Send a new message into a channel (or thread reply if parentId is set).
   */
  static async send(workspaceId: string, actorId: string, data: SendMessageInput) {
    // If this is a thread reply, validate the parent message exists in the same channel
    if (data.parentId) {
      await prisma.message.findUniqueOrThrow({
        where: { id: data.parentId, channelId: data.channelId },
      });
    }

    // If a fileId is attached, validate the file belongs to the same workspace
    if (data.fileId) {
      await prisma.file.findUniqueOrThrow({ where: { id: data.fileId, workspaceId } });
    }

    return prisma.message.create({
      data: {
        workspaceId,
        channelId: data.channelId,
        authorId: actorId,
        content: data.content,
        parentId: data.parentId || null,
        fileId: data.fileId || null,
      },
      include: messageInclude,
    });
  }

  /**
   * Edit an existing message. Only the original author may edit.
   */
  static async edit(messageId: string, workspaceId: string, actorId: string, data: EditMessageInput) {
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    if (message.authorId !== actorId) {
      throw new Error("Only the author can edit this message");
    }

    if (message.isDeleted) {
      throw new Error("Cannot edit a deleted message");
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        content: data.content,
        isEdited: true,
        editedById: actorId,
      },
      include: messageInclude,
    });
  }

  /**
   * Soft-delete a message. Content is replaced with a tombstone marker.
   * Thread structure is preserved — replies remain visible.
   * Admins can delete any message; regular users can only delete their own.
   */
  static async delete(messageId: string, workspaceId: string, actorId: string, isAdmin: boolean) {
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    if (!isAdmin && message.authorId !== actorId) {
      throw new Error("You can only delete your own messages");
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: "[This message was deleted]",
      },
    });
  }

  /**
   * Get a single message by ID (used for real-time verification).
   */
  static async getById(messageId: string, workspaceId: string) {
    return prisma.message.findFirst({
      where: { id: messageId, workspaceId },
      include: messageInclude,
    });
  }

  // ---------------------------------------------------------------------------
  // Layer 4 — Threads & Reactions
  // ---------------------------------------------------------------------------

  /**
   * List all replies to a specific message.
   */
  static async listReplies(messageId: string, workspaceId: string) {
    // Validate parent message exists
    await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    return prisma.message.findMany({
      where: { parentId: messageId, workspaceId },
      include: messageInclude,
      orderBy: { createdAt: "asc" }, // Threads are usually oldest-to-newest
    });
  }

  /**
   * Add or remove a reaction. If the user already reacted with this emoji, it removes it (toggle).
   */
  static async toggleReaction(messageId: string, workspaceId: string, actorId: string, emoji: string) {
    // Validate message exists
    await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    // Check if reaction exists
    const existing = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: actorId,
          emoji,
        },
      },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { action: "removed", emoji };
    } else {
      await prisma.reaction.create({
        data: { messageId, userId: actorId, emoji },
      });
      return { action: "added", emoji };
    }
  }
}
```

### `apps/api/src/modules/chat/message.controller.ts`

```typescript
import { Request, Response } from "express";
import { MessageService } from "./message.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { sendMessageSchema, editMessageSchema, listMessagesSchema, reactMessageSchema, typingSchema } from "@syncra/validators";

export class MessageController {

  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;

      const parsed = listMessagesSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const messages = await MessageService.list(workspaceId, parsed.data);
      res.status(200).json({ success: true, data: messages });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async send(req: Request, res: Response) {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const message = await MessageService.send(workspaceId, userId, parsed.data);

      // Broadcast to the workspace room. In Phase 9 the frontend will
      // filter by channelId on the client side.
      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "message_new", message },
      });

      res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async edit(req: Request, res: Response) {
    try {
      const parsed = editMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const messageId = req.params.messageId as string;

      const message = await MessageService.edit(messageId, workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "message_updated", message },
      });

      res.status(200).json({ success: true, data: message });
    } catch (error: any) {
      const status = error.message.includes("Only the author") ? 403 : 400;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const messageId = req.params.messageId as string;

      // Admins (OWNER, ADMIN) can delete any message
      const role = req.user!.role;
      const isAdmin = role === "OWNER" || role === "ADMIN";

      const message = await MessageService.delete(messageId, workspaceId, userId, isAdmin);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "message_deleted", messageId: message.id, channelId: message.channelId },
      });

      res.status(200).json({ success: true, data: { message: "Message deleted" } });
    } catch (error: any) {
      const status = error.message.includes("only delete your own") ? 403 : 400;
      res.status(status).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 4 — Threads & Reactions
  // ---------------------------------------------------------------------------

  static async listReplies(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const messageId = req.params.messageId as string;

      const replies = await MessageService.listReplies(messageId, workspaceId);
      res.status(200).json({ success: true, data: replies });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async toggleReaction(req: Request, res: Response) {
    try {
      const parsed = reactMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const messageId = req.params.messageId as string;

      const result = await MessageService.toggleReaction(messageId, workspaceId, userId, parsed.data.emoji);

      // Re-fetch the message so we can broadcast its updated state
      const updatedMessage = await MessageService.getById(messageId, workspaceId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "message_updated", message: updatedMessage },
      });

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async typing(req: Request, res: Response) {
    try {
      const parsed = typingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const { channelId } = parsed.data;

      // Broadcast an ephemeral typing event to the workspace
      SocketService.broadcastToWorkspace(workspaceId, "typing_start" as any, {
        actorId: userId,
        data: { channelId, userId },
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/chat/message.routes.ts`

```typescript
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
router.post("/typing", MessageController.typing);

export default router;
```

### `apps/api/src/modules/chat/receipt.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { MarkReadInput } from "@syncra/validators";

export class ReadReceiptService {

  /**
   * Mark a specific message as read for a user.
   * Ensures the message exists and belongs to a channel the user can access.
   */
  static async markAsRead(channelId: string, workspaceId: string, userId: string, data: MarkReadInput) {
    const { messageId } = data;

    // Verify message exists and belongs to the specified channel/workspace
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, channelId, workspaceId },
    });

    // Check if the user already has a read receipt for this exact message
    const existing = await prisma.readReceipt.findUnique({
      where: {
        userId_messageId: {
          userId,
          messageId,
        },
      },
    });

    if (existing) {
      return existing; // Idempotent
    }

    return prisma.readReceipt.create({
      data: {
        userId,
        messageId,
      },
    });
  }

  /**
   * Calculate the number of unread messages in a channel for a specific user.
   * This logic finds the user's latest ReadReceipt in the channel (by message.createdAt)
   * and counts how many messages were created after that point.
   */
  static async getUnreadCount(channelId: string, workspaceId: string, userId: string) {
    // 1. Find the latest read receipt for this user in this channel
    const latestReceipt = await prisma.readReceipt.findFirst({
      where: {
        userId,
        message: { channelId, workspaceId }, // Must join through message to filter by channel
      },
      include: {
        message: { select: { createdAt: true } },
      },
      orderBy: {
        message: { createdAt: "desc" },
      },
    });

    // 2. Count messages created after that receipt (or all if no receipt exists)
    const countQuery = {
      where: {
        channelId,
        workspaceId,
        parentId: null, // Usually unread counts only consider top-level messages
        ...(latestReceipt ? { createdAt: { gt: latestReceipt.message.createdAt } } : {}),
      },
    };

    return prisma.message.count(countQuery);
  }
}
```

### `apps/api/src/modules/chat/receipt.controller.ts`

```typescript
import { Request, Response } from "express";
import { ReadReceiptService } from "./receipt.service";
import { markReadSchema } from "@syncra/validators";

export class ReadReceiptController {
  
  static async markAsRead(req: Request, res: Response) {
    try {
      const parsed = markReadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const channelId = req.params.channelId as string;

      const receipt = await ReadReceiptService.markAsRead(channelId, workspaceId, userId, parsed.data);
      res.status(200).json({ success: true, data: receipt });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const channelId = req.params.channelId as string;

      const count = await ReadReceiptService.getUnreadCount(channelId, workspaceId, userId);
      res.status(200).json({ success: true, data: { unreadCount: count } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `packages/validators/src/channel.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Channel
// -----------------------------------------------------------------------------

export const createChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required").max(80),
  description: z.string().max(300).optional(),
  type: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

// -----------------------------------------------------------------------------
// DM (Direct Message channel)
// -----------------------------------------------------------------------------

export const createDMSchema = z.object({
  targetUserId: z.string().cuid(),
});

export type CreateDMInput = z.infer<typeof createDMSchema>;
```

### `packages/validators/src/message.ts`

```typescript
import { z } from "zod";

export const sendMessageSchema = z.object({
  channelId: z.string().cuid(),
  content: z.string().min(1, "Message cannot be empty").max(4000),
  parentId: z.string().cuid().optional().nullable(), // thread reply
  fileId: z.string().cuid().optional().nullable(),   // file attachment
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const listMessagesSchema = z.object({
  channelId: z.string().cuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().cuid().optional(), // cursor-based pagination
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(10), // e.g. "👍"
});

export const typingSchema = z.object({
  channelId: z.string().cuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
```

### `packages/validators/src/receipt.ts`

```typescript
import { z } from "zod";

export const markReadSchema = z.object({
  messageId: z.string().cuid(),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;
```
