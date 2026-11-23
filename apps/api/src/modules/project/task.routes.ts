import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { TaskController } from "./task.controller";

const router = Router();

// All task routes require authentication and an active workspace context
router.use(requireAuth, requireWorkspace);

// Subtask direct operations
router.patch(
  "/subtasks/:subtaskId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.toggleSubtask
);
router.delete(
  "/subtasks/:subtaskId",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.deleteSubtask
);

// List tasks (supports filtering via query params)
router.get("/", TaskController.list);

// Task-nested subtasks
router.get("/:taskId/subtasks", TaskController.listSubtasks);
router.post(
  "/:taskId/subtasks",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.createSubtask
);

// Task-nested comments
router.get("/:taskId/comments", TaskController.listComments);
router.post(
  "/:taskId/comments",
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  TaskController.createComment
);

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
