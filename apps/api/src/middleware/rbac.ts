import { Request, Response, NextFunction } from "express";
import { Permission, ROLE_PERMISSIONS, WorkspaceRole } from "@syncra/validators";

/**
 * Middleware: requirePermission
 * Ensures the authenticated user's active tenant role includes the specified permission.
 * MUST be used AFTER `requireAuth` and `requireWorkspace`.
 */
export function requirePermission(requiredPermission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Validate tenant context exists
    if (!req.user || !req.user.workspaceId || !req.user.role) {
      res.status(401).json({ success: false, error: "Unauthorized - Tenant context required for permission check" });
      return;
    }

    const role = req.user.role as WorkspaceRole;
    
    // 2. Owner bypasses all granular checks (God Mode)
    if (role === WorkspaceRole.OWNER) {
      return next();
    }

    // 3. Lookup allowed permissions for this role
    const allowedPermissions = ROLE_PERMISSIONS[role];
    
    // 4. Enforce
    if (!allowedPermissions || !allowedPermissions.includes(requiredPermission)) {
      res.status(403).json({ 
        success: false, 
        error: `Forbidden - Missing required permission: ${requiredPermission}` 
      });
      return;
    }

    next();
  };
}
