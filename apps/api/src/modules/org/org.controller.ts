import { Request, Response } from "express";
import { OrgService } from "./org.service";
import { setManagerSchema } from "@syncra/validators";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class OrgController {
  
  static async getChart(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const chart = await OrgService.getOrgChart(workspaceId);
      res.status(200).json({ success: true, data: chart });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async setManager(req: Request, res: Response) {
    try {
      const parsed = setManagerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const workspaceId = req.user!.workspaceId!;
      // An admin might want to set a manager for someone else, or a user for themselves.
      // For now, let's allow a user to set their own manager, or use a targetUserId param if Admin.
      // Let's use targetUserId from params.
      const targetUserId = req.params.userId as string;

      // Note: Ideally require ADMIN/OWNER permissions in routes for this.
      const updated = await OrgService.setManager(workspaceId, targetUserId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.ORG_CHART_UPDATED, {
        actorId: req.user!.userId,
        data: updated,
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
