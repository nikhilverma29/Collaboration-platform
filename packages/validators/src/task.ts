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
