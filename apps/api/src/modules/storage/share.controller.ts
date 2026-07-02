import { Request, Response } from "express";
import { ShareLinkService } from "./share.service";
import { createShareLinkSchema } from "@syncra/validators";

export class ShareLinkController {
  
  static async create(req: Request, res: Response) {
    try {
      const parsed = createShareLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const link = await ShareLinkService.create(fileId, workspaceId, userId, parsed.data);
      res.status(201).json({ success: true, data: link });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const links = await ShareLinkService.listByFile(fileId, workspaceId);
      res.status(200).json({ success: true, data: links });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const linkId = req.params.linkId as string;

      await ShareLinkService.delete(linkId, workspaceId);
      res.status(200).json({ success: true, data: { message: "Share link revoked" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * PUBLIC endpoint. No auth required.
   */
  static async accessPublic(req: Request, res: Response) {
    try {
      const token = req.params.token as string;
      const accessData = await ShareLinkService.accessPublicLink(token);
      res.status(200).json({ success: true, data: accessData });
    } catch (error: any) {
      res.status(404).json({ success: false, error: error.message });
    }
  }
}
