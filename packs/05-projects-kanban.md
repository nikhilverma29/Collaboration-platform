# 05-projects-kanban — Projects & Kanban

## Purpose

Projects, Kanban boards with columns, tasks with priority/status/labels, drag-and-drop position updates, task history tracking, and real-time task state synchronization via Socket.io.

## Dependencies

- `00-core-foundation`
- `02-workspace-tenancy`
- `03-rbac-governance`
- `04-realtime-infra`

## Main User Flow

POST /api/projects → create project. GET /api/projects/:id/board → full board with columns+tasks. POST /api/tasks → create task in column. PATCH /api/tasks/:id/move → reorder task. Every mutation emits a socket event to the workspace room.

## Files Involved

- `apps/api/src/modules/project/project.service.ts`
- `apps/api/src/modules/project/project.controller.ts`
- `apps/api/src/modules/project/project.routes.ts`
- `apps/api/src/modules/project/task.service.ts`
- `apps/api/src/modules/project/task.controller.ts`
- `apps/api/src/modules/project/task.routes.ts`
- `apps/api/src/modules/project/column.service.ts`
- `packages/validators/src/project.ts`
- `packages/validators/src/task.ts`

## Source Code

### `apps/api/src/modules/project/project.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateProjectInput, UpdateProjectInput } from "@syncra/validators";

export class ProjectService {
  /**
   * Create a new project within a workspace.
   * Automatically creates a default "Main Board" with 4 standard columns.
   */
  static async create(workspaceId: string, userId: string, data: CreateProjectInput) {
    const project = await prisma.project.create({
      data: {
        workspaceId,
        createdById: userId,
        name: data.name,
        description: data.description,
        // Auto-add the creator as a project member
        members: {
          create: { userId },
        },
        // Auto-create a default Kanban board with standard columns
        boards: {
          create: {
            name: "Main Board",
            columns: {
              create: [
                { name: "To Do",       position: 0 },
                { name: "In Progress", position: 1 },
                { name: "In Review",   position: 2 },
                { name: "Done",        position: 3 },
              ],
            },
          },
        },
      },
      include: {
        boards: { include: { columns: { orderBy: { position: "asc" } } } },
        members: true,
      },
    });

    return project;
  }

  /**
   * List all active (non-archived) projects for a workspace.
   */
  static async listByWorkspace(workspaceId: string) {
    return prisma.project.findMany({
      where: { workspaceId, isArchived: false },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        members: { select: { userId: true } },
        _count: { select: { boards: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get full details of a single project (boards + columns).
   */
  static async getById(projectId: string, workspaceId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        members: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
          },
        },
        boards: {
          include: {
            columns: { orderBy: { position: "asc" } },
          },
        },
      },
    });
  }

  /**
   * Update a project's name or description.
   */
  static async update(projectId: string, workspaceId: string, data: UpdateProjectInput) {
    return prisma.project.update({
      where: { id: projectId },
      data,
    });
  }

  /**
   * Soft-archive a project (hidden from list, data retained).
   */
  static async archive(projectId: string, workspaceId: string) {
    return prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true },
    });
  }

  /**
   * Permanently delete a project and all its nested data via Cascade.
   */
  static async delete(projectId: string, workspaceId: string) {
    return prisma.project.delete({
      where: { id: projectId },
    });
  }

  // ---------------------------------------------------------------------------
  // Project Members
  // ---------------------------------------------------------------------------

  static async addMember(projectId: string, userId: string) {
    return prisma.projectMember.create({
      data: { projectId, userId },
    });
  }

  static async removeMember(projectId: string, userId: string) {
    return prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  static async listMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
      },
    });
  }
}
```

### `apps/api/src/modules/project/project.controller.ts`

```typescript
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
```

### `apps/api/src/modules/project/project.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { ProjectController } from "./project.controller";

const router = Router();

// All project routes require authentication and an active workspace context
router.use(requireAuth, requireWorkspace);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

// Create a project — requires PROJECT_CREATE permission
router.post(
  "/",
  requirePermission(PERMISSIONS.PROJECT_CREATE),
  ProjectController.create
);

// List all projects in the active workspace
router.get("/", ProjectController.list);

// Get a single project with its boards and columns
router.get("/:projectId", ProjectController.getOne);

// Update a project (name / description)
router.put(
  "/:projectId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ProjectController.update
);

// Archive a project (soft-delete)
router.post(
  "/:projectId/archive",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ProjectController.archive
);

// Delete a project permanently
router.delete(
  "/:projectId",
  requirePermission(PERMISSIONS.PROJECT_DELETE),
  ProjectController.remove
);

// ---------------------------------------------------------------------------
// Project Members
// ---------------------------------------------------------------------------

router.get("/:projectId/members", ProjectController.listMembers);

// Add a workspace member to a project
router.post(
  "/:projectId/members",
  requirePermission(PERMISSIONS.MEMBER_INVITE),
  ProjectController.addMember
);

// Remove a member from a project
router.delete(
  "/:projectId/members/:userId",
  requirePermission(PERMISSIONS.MEMBER_REMOVE),
  ProjectController.removeMember
);

// ---------------------------------------------------------------------------
// Boards & Columns
// (Board is auto-created with the project; columns are managed here)
// ---------------------------------------------------------------------------

// List columns for a board
router.get("/boards/:boardId/columns", ProjectController.listColumns);

// Create a new column
router.post(
  "/boards/:boardId/columns",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ProjectController.createColumn
);

// Update a column (rename / reorder)
router.put(
  "/columns/:columnId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  ProjectController.updateColumn
);

// Delete a column
router.delete(
  "/columns/:columnId",
  requirePermission(PERMISSIONS.PROJECT_DELETE),
  ProjectController.deleteColumn
);

export default router;
```

### `apps/api/src/modules/project/task.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateTaskInput, UpdateTaskInput, MoveTaskInput, TaskFilterQuery } from "@syncra/validators";
import { Prisma } from "@prisma/client";

export class TaskService {
  
  /**
   * List tasks for a project with optional filtering.
   */
  static async list(workspaceId: string, query: TaskFilterQuery) {
    const where: Prisma.TaskWhereInput = {
      workspaceId,
      projectId: query.projectId,
      isArchived: false,
    };

    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.priority) where.priority = query.priority;
    if (query.status) where.status = query.status;
    if (query.label) where.labels = { contains: query.label, mode: 'insensitive' };

    return prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, displayName: true, avatarUrl: true } },
        reporter: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: [
        { columnId: 'asc' },
        { position: 'asc' }
      ]
    });
  }

  /**
   * Get full details of a single task, including its history.
   */
  static async getById(taskId: string, workspaceId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        assignee: { select: { id: true, displayName: true, avatarUrl: true } },
        reporter: { select: { id: true, displayName: true, avatarUrl: true } },
        column: { select: { id: true, name: true } },
        history: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } }
        }
      },
    });
  }

  /**
   * Create a new task.
   */
  static async create(workspaceId: string, actorId: string, data: CreateTaskInput) {
    let position = data.position;
    if (position === undefined) {
      const lastTask = await prisma.task.findFirst({
        where: { columnId: data.columnId },
        orderBy: { position: "desc" },
      });
      position = lastTask ? lastTask.position + 1 : 0;
    }

    // Run creation and initial history log in a transaction
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId,
          projectId: data.projectId,
          columnId: data.columnId,
          title: data.title,
          description: data.description,
          priority: data.priority,
          status: data.status,
          labels: data.labels,
          assigneeId: data.assigneeId,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          reporterId: actorId,
          position,
        },
        include: {
          assignee: { select: { id: true, displayName: true, avatarUrl: true } }
        }
      });

      await tx.taskHistory.create({
        data: {
          taskId: task.id,
          actorId,
          action: "CREATED",
          metadata: { title: task.title, columnId: task.columnId }
        }
      });

      return task;
    });
  }

  /**
   * Update task details (title, description, priority, assignee, etc).
   * Note: Moving between columns/positions should use move() instead for clean history.
   */
  static async update(taskId: string, workspaceId: string, actorId: string, data: UpdateTaskInput) {
    return prisma.$transaction(async (tx) => {
      const oldTask = await tx.task.findUniqueOrThrow({ where: { id: taskId } });

      const task = await tx.task.update({
        where: { id: taskId, workspaceId },
        data: {
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
        },
        include: {
          assignee: { select: { id: true, displayName: true, avatarUrl: true } }
        }
      });

      // Generate appropriate history records based on what changed
      const historyEntries: Prisma.TaskHistoryCreateManyInput[] = [];
      
      if (oldTask.assigneeId !== task.assigneeId) {
        historyEntries.push({
          taskId, actorId, 
          action: task.assigneeId ? "ASSIGNED" : "UNASSIGNED",
          metadata: { from: oldTask.assigneeId, to: task.assigneeId }
        });
      }
      
      if (oldTask.priority !== task.priority) {
        historyEntries.push({
          taskId, actorId, action: "PRIORITY_CHANGED",
          metadata: { from: oldTask.priority, to: task.priority }
        });
      }

      if (oldTask.status !== task.status) {
        historyEntries.push({
          taskId, actorId, action: "STATUS_CHANGED",
          metadata: { from: oldTask.status, to: task.status }
        });
      }

      if (data.isArchived && !oldTask.isArchived) {
        historyEntries.push({ taskId, actorId, action: "ARCHIVED" });
      }

      // Fallback generic update if other fields changed
      if (historyEntries.length === 0 && (data.title || data.description || data.labels || data.dueDate !== undefined)) {
        historyEntries.push({ taskId, actorId, action: "UPDATED" });
      }

      if (historyEntries.length > 0) {
        await tx.taskHistory.createMany({ data: historyEntries });
      }

      return task;
    });
  }

  /**
   * Move a task (drag and drop) to a new position, potentially in a new column.
   */
  static async move(taskId: string, workspaceId: string, actorId: string, data: MoveTaskInput) {
    return prisma.$transaction(async (tx) => {
      const oldTask = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      
      const newColumnId = data.columnId || oldTask.columnId;
      const changedColumn = oldTask.columnId !== newColumnId;

      const task = await tx.task.update({
        where: { id: taskId, workspaceId },
        data: {
          columnId: newColumnId,
          position: data.position,
        }
      });

      if (changedColumn) {
        await tx.taskHistory.create({
          data: {
            taskId, actorId, action: "MOVED",
            metadata: { fromColumn: oldTask.columnId, toColumn: newColumnId }
          }
        });
      }

      return task;
    });
  }

  /**
   * Delete a task.
   */
  static async delete(taskId: string, workspaceId: string, actorId: string) {
    // Delete cascades to TaskHistory automatically
    return prisma.task.delete({
      where: { id: taskId, workspaceId },
    });
  }
}
```

### `apps/api/src/modules/project/task.controller.ts`

```typescript
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "task_created", task },
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "task_updated", task },
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "task_moved", task },
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

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "task_deleted", taskId },
      });

      res.status(200).json({ success: true, data: { message: "Task deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/project/task.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { TaskController } from "./task.controller";

const router = Router();

// All task routes require authentication and an active workspace context
router.use(requireAuth, requireWorkspace);

// List tasks (supports filtering via query params)
router.get("/", TaskController.list);

// Get a single task (including history)
router.get("/:taskId", TaskController.getOne);

// Create a new task
router.post(
  "/",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.create
);

// Update a task (content, status, assignee, priority)
router.put(
  "/:taskId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.update
);

// Move/reorder a task (drag and drop)
router.post(
  "/:taskId/move",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.move
);

// Delete a task completely
router.delete(
  "/:taskId",
  requirePermission(PERMISSIONS.PROJECT_DELETE),
  TaskController.remove
);

export default router;
```

### `apps/api/src/modules/project/column.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateColumnInput, UpdateColumnInput } from "@syncra/validators";

export class ColumnService {
  /**
   * List all columns in a board, ordered by position.
   */
  static async listByBoard(boardId: string) {
    return prisma.column.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
    });
  }

  /**
   * Create a new column at the end of a board.
   * If no position is specified, it appends after the last column.
   */
  static async create(boardId: string, data: CreateColumnInput) {
    let position = data.position;
    if (position === undefined) {
      const lastColumn = await prisma.column.findFirst({
        where: { boardId },
        orderBy: { position: "desc" },
      });
      position = lastColumn ? lastColumn.position + 1 : 0;
    }

    return prisma.column.create({
      data: { boardId, name: data.name, position },
    });
  }

  /**
   * Update a column's name and/or position.
   */
  static async update(columnId: string, data: UpdateColumnInput) {
    return prisma.column.update({
      where: { id: columnId },
      data,
    });
  }

  /**
   * Delete a column. All tasks inside it must be moved first or will Cascade.
   */
  static async delete(columnId: string) {
    return prisma.column.delete({
      where: { id: columnId },
    });
  }
}
```

### `packages/validators/src/project.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Project
// -----------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// -----------------------------------------------------------------------------
// Column
// -----------------------------------------------------------------------------

export const createColumnSchema = z.object({
  name: z.string().min(1, "Column name is required").max(80),
  position: z.number().int().min(0).optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
```

### `packages/validators/src/task.ts`

```typescript
import { z } from "zod";

export const TaskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TaskStatusEnum = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);

export const createTaskSchema = z.object({
  projectId: z.string().cuid(),
  columnId: z.string().cuid(),
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().max(2000).optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  labels: z.string().optional(), // Comma-separated
  assigneeId: z.string().cuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(), // Optional, defaults to appending
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  labels: z.string().optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().cuid().optional(),
  position: z.number(),
});

export const taskFilterSchema = z.object({
  projectId: z.string().cuid(),
  assigneeId: z.string().cuid().optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  label: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type TaskFilterQuery = z.infer<typeof taskFilterSchema>;
```
