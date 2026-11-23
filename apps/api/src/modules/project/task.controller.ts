import { Request, Response } from "express";
import { TaskService } from "./task.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { createTaskSchema, updateTaskSchema, moveTaskSchema, taskFilterSchema } from "@syncra/validators";

export class TaskController {
  
  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      
      const parsed = taskFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const tasks = await TaskService.list(workspaceId, parsed.data);
      res.status(200).json({ success: true, data: tasks });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const taskId = req.params.taskId as string;

      const task = await TaskService.getById(taskId, workspaceId);
      if (!task) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      res.status(200).json({ success: true, data: task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const task = await TaskService.create(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TASK_CREATED, {
        actorId: userId,
        data: task,
      });

      res.status(201).json({ success: true, data: task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const taskId = req.params.taskId as string;

      const task = await TaskService.update(taskId, workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TASK_UPDATED, {
        actorId: userId,
        data: task,
      });

      res.status(200).json({ success: true, data: task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const parsed = moveTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const taskId = req.params.taskId as string;

      const task = await TaskService.move(taskId, workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TASK_MOVED, {
        actorId: userId,
        data: task,
      });

      res.status(200).json({ success: true, data: task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const taskId = req.params.taskId as string;

      await TaskService.delete(taskId, workspaceId, userId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.TASK_DELETED, {
        actorId: userId,
        data: { taskId },
      });

      res.status(200).json({ success: true, data: { message: "Task deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
