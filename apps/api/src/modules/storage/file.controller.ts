import { Request, Response } from "express";
import { FileService } from "./file.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { registerFileSchema, renameFileSchema, moveFileSchema } from "@syncra/validators";

export class FileController {
  
  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.query.folderId as string | undefined;

      const files = await FileService.list(workspaceId, folderId);
      res.status(200).json({ success: true, data: files });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async requestUploadUrl(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const { fileName } = req.body;
      
      if (!fileName) {
        res.status(400).json({ success: false, error: "fileName is required" });
        return;
      }

      const uploadInfo = await FileService.getUploadUrl(workspaceId, fileName);
      res.status(200).json({ success: true, data: uploadInfo });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async registerFile(req: Request, res: Response) {
    try {
      const parsed = registerFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const file = await FileService.registerFile(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_uploaded", file },
      });

      res.status(201).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getDownloadUrl(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const downloadInfo = await FileService.getDownloadUrl(fileId, workspaceId);
      res.status(200).json({ success: true, data: downloadInfo });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async rename(req: Request, res: Response) {
    try {
      const parsed = renameFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const file = await FileService.rename(fileId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_renamed", file },
      });

      res.status(200).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const parsed = moveFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const file = await FileService.move(fileId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_moved", file },
      });

      res.status(200).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      await FileService.delete(fileId, workspaceId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_deleted", fileId },
      });

      res.status(200).json({ success: true, data: { message: "File deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
