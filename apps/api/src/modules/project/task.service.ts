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

  // ── Subtasks ─────────────────────────────────────────────────────────────
  static async listSubtasks(taskId: string, workspaceId: string) {
    await prisma.task.findUniqueOrThrow({ where: { id: taskId, workspaceId } });
    return prisma.taskSubtask.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async createSubtask(taskId: string, workspaceId: string, title: string) {
    await prisma.task.findUniqueOrThrow({ where: { id: taskId, workspaceId } });
    return prisma.taskSubtask.create({
      data: { taskId, title },
    });
  }

  static async toggleSubtask(subtaskId: string, workspaceId: string, done: boolean) {
    const subtask = await prisma.taskSubtask.findUniqueOrThrow({
      where: { id: subtaskId },
      include: { task: { select: { workspaceId: true } } },
    });
    if (subtask.task.workspaceId !== workspaceId) {
      throw new Error("Unauthorized");
    }
    return prisma.taskSubtask.update({
      where: { id: subtaskId },
      data: { done },
    });
  }

  static async deleteSubtask(subtaskId: string, workspaceId: string) {
    const subtask = await prisma.taskSubtask.findUniqueOrThrow({
      where: { id: subtaskId },
      include: { task: { select: { workspaceId: true } } },
    });
    if (subtask.task.workspaceId !== workspaceId) {
      throw new Error("Unauthorized");
    }
    return prisma.taskSubtask.delete({
      where: { id: subtaskId },
    });
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  static async listComments(taskId: string, workspaceId: string) {
    await prisma.task.findUniqueOrThrow({ where: { id: taskId, workspaceId } });
    return prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  static async createComment(
    taskId: string,
    workspaceId: string,
    authorId: string,
    content: string,
    isSystem: boolean = false
  ) {
    await prisma.task.findUniqueOrThrow({ where: { id: taskId, workspaceId } });
    return prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        content,
        isSystem,
      },
      include: {
        author: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }
}
