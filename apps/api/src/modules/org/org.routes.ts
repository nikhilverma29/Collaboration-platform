import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { OrgController } from "./org.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Get the flat organization tree for the workspace
router.get("/", OrgController.getChart);

// Assign or remove a manager from a user
// Requires ADMIN rights to modify the org chart
router.put(
  "/:userId/manager",
  requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
  OrgController.setManager
);

export default router;
