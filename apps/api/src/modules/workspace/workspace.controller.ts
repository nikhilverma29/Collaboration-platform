import { Request, Response } from "express";
import { WorkspaceService } from "./workspace.service";
import { createWorkspaceSchema, joinWorkspaceSchema } from "@syncra/validators";
import { signAccessToken } from "../../lib/jwt";
import { AuditService } from "../audit/audit.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class WorkspaceController {
  /**
   * Creates a new workspace.
   */
  static async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = createWorkspaceSchema.parse(req.body);
      
      const workspace = await WorkspaceService.createWorkspace(userId, data);
      
      res.status(201).json({ success: true, data: workspace });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Joins a workspace via invite code.
   */
  static async join(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = joinWorkspaceSchema.parse(req.body);
      
      const result = await WorkspaceService.joinWorkspace(userId, data);
      
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Lists all workspaces for the authenticated user.
   */
  static async list(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaces = await WorkspaceService.listUserWorkspaces(userId);
      
      res.status(200).json({ success: true, data: workspaces });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Switch into a workspace.
   * Issues a new access token that includes the workspaceId and role in the payload.
   */
  static async switch(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.params.workspaceId as string;
      
      if (!workspaceId) {
        res.status(400).json({ success: false, error: "Workspace ID is required" });
        return;
      }

      // Verify membership via service — controller does not touch prisma directly
      const membership = await WorkspaceService.getMembership(userId, workspaceId);
      
      if (!membership) {
        res.status(403).json({ success: false, error: "Forbidden - Not a member of this workspace" });
        return;
      }
      
      // Issue a new, tenant-aware access token
      const accessToken = signAccessToken({
        userId,
        workspaceId,
        role: membership.role,
        sessionId: req.user!.sessionId
      });
      
      // Update just the access token cookie
      res.cookie("syncra_access", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 15 * 60 * 1000 // 15 minutes
      });
      
      res.status(200).json({ 
        success: true, 
        data: { workspaceId, role: membership.role } 
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Update a workspace.
   * Requires WORKSPACE_UPDATE permission (checked by middleware).
   * Demonstrates Audit Logging.
   */
  static async update(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.params.workspaceId as string;
      const { name } = req.body;
      
      // All data access goes through the service — controller has no prisma import
      const { oldWorkspace, workspace } = await WorkspaceService.update(workspaceId, name);
      
      // Write Audit Log
      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "workspace.update",
        metadata: {
          oldName: oldWorkspace?.name,
          newName: workspace.name
        }
      });
      
      // Broadcast realtime event
      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: workspace
      });
      
      res.status(200).json({ success: true, data: workspace });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
  /**
   * Get workspace dashboard summary.
   */
  static getSummary = async (req: Request, res: Response) => {
    try {
      const summary = await WorkspaceService.getSummary(req.user!.workspaceId!);
      res.status(200).json({ success: true, data: summary });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  /**
   * Get all members.
   */
  static getMembers = async (req: Request, res: Response) => {
    try {
      const members = await WorkspaceService.getMembers(req.user!.workspaceId!);
      res.status(200).json({ success: true, data: members });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  /**
   * Remove a member.
   */
  static removeMember = async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      await WorkspaceService.removeMember(req.user!.workspaceId!, userId);
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  /**
   * Get audit logs.
   */
  static getAuditLogs = async (req: Request, res: Response) => {
    try {
      const logs = await WorkspaceService.getAuditLogs(req.user!.workspaceId!);
      res.status(200).json({ success: true, data: logs });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };
}

