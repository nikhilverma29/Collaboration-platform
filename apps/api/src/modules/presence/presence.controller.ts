import { Request, Response } from "express";
import { PresenceService } from "./presence.service";

export class PresenceController {

  /**
   * Get dynamic presence status for ALL members in the user's workspace.
   * The frontend uses this on initial load; real-time updates come via socket.
   */
  static async getWorkspacePresence(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const presence = await PresenceService.getWorkspacePresence(workspaceId);
      res.status(200).json({ success: true, data: presence });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Get presence status for a single user.
   */
  static async getUserPresence(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const userId = req.params.userId as string;
      const presence = await PresenceService.computeStatus(workspaceId, userId);
      res.status(200).json({ success: true, data: presence });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
