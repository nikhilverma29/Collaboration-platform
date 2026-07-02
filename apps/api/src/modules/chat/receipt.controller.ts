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
