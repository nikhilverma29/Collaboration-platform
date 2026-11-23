import { Request, Response } from "express";
import { FolderService } from "./folder.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { createFolderSchema, renameFolderSchema, moveFolderSchema } from "@syncra/validators";

export class FolderController {
  
  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const parentId = req.query.parentId as string | undefined;

      const folders = await FolderService.list(workspaceId, parentId);
      res.status(200).json({ success: true, data: folders });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.getById(folderId, workspaceId);
      if (!folder) {
        res.status(404).json({ success: false, error: "Folder not found" });
        return;
      }

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const parsed = createFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const folder = await FolderService.create(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.FOLDER_CREATED, {
        actorId: userId,
        data: folder,
      });

      res.status(201).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async rename(req: Request, res: Response) {
    try {
      const parsed = renameFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.rename(folderId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.FOLDER_RENAMED, {
        actorId: userId,
        data: folder,
      });

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const parsed = moveFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.move(folderId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.FOLDER_MOVED, {
        actorId: userId,
        data: folder,
      });

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      await FolderService.delete(folderId, workspaceId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.FOLDER_DELETED, {
        actorId: userId,
        data: { folderId },
      });

      res.status(200).json({ success: true, data: { message: "Folder deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
