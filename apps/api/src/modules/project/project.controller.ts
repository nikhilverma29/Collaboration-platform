import { Request, Response } from "express";
import { ProjectService } from "./project.service";
import { ColumnService } from "./column.service";
import { createProjectSchema, updateProjectSchema, createColumnSchema, updateColumnSchema } from "@syncra/validators";
import { AuditService } from "../audit/audit.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class ProjectController {
  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  static async create(req: Request, res: Response) {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const project = await ProjectService.create(workspaceId, userId, parsed.data);

      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "project.create",
        targetId: project.id,
        metadata: { name: project.name },
      });

      res.status(201).json({ success: true, data: project });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const projects = await ProjectService.listByWorkspace(workspaceId);
      res.status(200).json({ success: true, data: projects });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;

      const project = await ProjectService.getById(projectId, workspaceId);
      if (!project) {
        res.status(404).json({ success: false, error: "Project not found" });
        return;
      }

      res.status(200).json({ success: true, data: project });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;

      const project = await ProjectService.update(projectId, workspaceId, parsed.data);

      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "project.update",
        targetId: projectId,
        metadata: parsed.data,
      });

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "project_updated", project },
      });

      res.status(200).json({ success: true, data: project });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async archive(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;

      const project = await ProjectService.archive(projectId, workspaceId);

      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "project.archive",
        targetId: projectId,
      });

      res.status(200).json({ success: true, data: project });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;

      await ProjectService.delete(projectId, workspaceId);

      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "project.delete",
        targetId: projectId,
      });

      res.status(200).json({ success: true, data: { message: "Project deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Project Members
  // ---------------------------------------------------------------------------

  static async listMembers(req: Request, res: Response) {
    try {
      const projectId = req.params.projectId as string;
      const members = await ProjectService.listMembers(projectId);
      res.status(200).json({ success: true, data: members });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async addMember(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;
      const { userId: targetUserId } = req.body;

      if (!targetUserId) {
        res.status(400).json({ success: false, error: "userId is required" });
        return;
      }

      const member = await ProjectService.addMember(projectId, targetUserId);

      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "project.member_added",
        targetId: projectId,
        metadata: { addedUserId: targetUserId },
      });

      res.status(201).json({ success: true, data: member });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const actorId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const projectId = req.params.projectId as string;
      const targetUserId = req.params.userId as string;

      await ProjectService.removeMember(projectId, targetUserId);

      await AuditService.log({
        workspaceId,
        actorId,
        action: "project.member_removed",
        targetId: projectId,
        metadata: { removedUserId: targetUserId },
      });

      res.status(200).json({ success: true, data: { message: "Member removed from project" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  static async listColumns(req: Request, res: Response) {
    try {
      const boardId = req.params.boardId as string;
      const columns = await ColumnService.listByBoard(boardId);
      res.status(200).json({ success: true, data: columns });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async createColumn(req: Request, res: Response) {
    try {
      const parsed = createColumnSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const boardId = req.params.boardId as string;
      const column = await ColumnService.create(boardId, parsed.data);
      res.status(201).json({ success: true, data: column });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async updateColumn(req: Request, res: Response) {
    try {
      const parsed = updateColumnSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const columnId = req.params.columnId as string;
      const column = await ColumnService.update(columnId, parsed.data);
      res.status(200).json({ success: true, data: column });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async deleteColumn(req: Request, res: Response) {
    try {
      const columnId = req.params.columnId as string;
      await ColumnService.delete(columnId);
      res.status(200).json({ success: true, data: { message: "Column deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
