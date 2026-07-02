import { Request, Response } from "express";
import { NotificationService } from "./notification.service";

export class NotificationController {
  static list = async (req: Request, res: Response) => {
    try {
      const notifications = await NotificationService.list(req.user!.workspaceId!, req.user!.userId);
      res.status(200).json({ success: true, data: notifications });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  static markAsRead = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const notification = await NotificationService.markAsRead(req.user!.workspaceId!, req.user!.userId, id);
      res.status(200).json({ success: true, data: notification });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  static markAllAsRead = async (req: Request, res: Response) => {
    try {
      await NotificationService.markAllAsRead(req.user!.workspaceId!, req.user!.userId);
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  static delete = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await NotificationService.delete(req.user!.workspaceId!, req.user!.userId, id);
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };
}
