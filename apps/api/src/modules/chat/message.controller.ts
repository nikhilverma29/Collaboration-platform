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

  static async typingStart(req: Request, res: Response) {
    try {
      const parsed = typingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const { channelId } = parsed.data;

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TYPING_START, {
        actorId: userId,
        data: { channelId, userId },
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async typingStop(req: Request, res: Response) {
    try {
      const parsed = typingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const { channelId } = parsed.data;

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TYPING_STOP, {
        actorId: userId,
        data: { channelId, userId },
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
