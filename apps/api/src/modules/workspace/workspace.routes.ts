import { Router } from "express";
import { WorkspaceController } from "./workspace.controller";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";

const router = Router();

// All workspace routes require authentication
router.use(requireAuth);

router.post("/", WorkspaceController.create);
router.post("/join", WorkspaceController.join);
router.get("/", WorkspaceController.list);

// Switch into a workspace (updates JWT with tenant context)
router.post("/:workspaceId/switch", WorkspaceController.switch);

// Test endpoint to verify tenant middleware (Layer 5 requirement)
router.get("/current", requireWorkspace, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: "You are inside a secure tenant context.",
      workspaceId: req.user!.workspaceId,
      role: req.user!.role,
    }
  });
});

// Update a workspace (Requires Tenant Context and WORKSPACE_UPDATE permission)
router.put(
  "/:workspaceId",
  requireWorkspace,
  requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
  WorkspaceController.update
);

// Dashboard summary
router.get("/:workspaceId/summary", requireWorkspace, WorkspaceController.getSummary);

// Members
router.get("/:workspaceId/members", requireWorkspace, WorkspaceController.getMembers);
router.delete(
  "/:workspaceId/members/:userId",
  requireWorkspace,
  requirePermission(PERMISSIONS.MEMBER_REMOVE), // Requires ADMIN+
  WorkspaceController.removeMember
);

// Audit logs
router.get(
  "/:workspaceId/audit-logs",
  requireWorkspace,
  requirePermission(PERMISSIONS.AUDIT_READ),
  WorkspaceController.getAuditLogs
);

export default router;
