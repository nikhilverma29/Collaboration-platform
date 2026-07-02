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
