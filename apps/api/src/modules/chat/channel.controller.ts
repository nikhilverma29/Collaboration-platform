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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.CHANNEL_CREATED, {
        actorId: userId,
        data: channel,
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.CHANNEL_UPDATED, {
        actorId: userId,
        data: channel,
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.CHANNEL_ARCHIVED, {
        actorId: req.user!.userId,
        data: { channelId },
      });

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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.CHANNEL_DELETED, {
        actorId: req.user!.userId,
        data: { channelId },
      });

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

      SocketService.broadcastToWorkspace(actorWorkspaceId, SOCKET_EVENTS.CHANNEL_UPDATED, {
        actorId: req.user!.userId,
        data: { type: "member_added", channelId, userId: targetUserId },
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
