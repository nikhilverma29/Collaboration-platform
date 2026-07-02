# 03-rbac-governance — RBAC & Governance

## Purpose

Role-Based Access Control enforced via the requirePermission middleware. Roles (OWNER, ADMIN, MANAGER, EMPLOYEE) map to explicit permission sets defined in the validators package. Audit log records every destructive action.

## Dependencies

- `00-core-foundation`
- `01-auth-sessions`
- `02-workspace-tenancy`

## Main User Flow

Request hits route → requireAuth → requireWorkspace → requirePermission(Permission.X) → checks ROLE_PERMISSIONS[role] → 403 if missing. Audit events written via AuditService.log().

## Files Involved

- `apps/api/src/middleware/rbac.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `packages/validators/src/rbac.ts`

## Source Code

### `apps/api/src/middleware/rbac.ts`

```typescript
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
```

### `apps/api/src/modules/audit/audit.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { Prisma } from "@prisma/client";

export class AuditService {
  /**
   * Records a governance or sensitive action to the audit log.
   * This should be used for important lifecycle events:
   * - Workspace created/deleted/updated
   * - Member invited/removed/role updated
   * - Security events
   */
  static async log(data: {
    workspaceId: string;
    actorId?: string; // Optional (e.g. system actions)
    action: string;
    targetId?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: data.workspaceId,
          actorId: data.actorId,
          action: data.action,
          targetId: data.targetId,
          metadata: data.metadata ? (data.metadata as Prisma.JsonObject) : undefined,
        }
      });
    } catch (err) {
      // In a production system, if audit logging fails, you might want to alert DevOps
      // but usually you don't want to fail the entire user request.
      console.error("[CRITICAL] Failed to write audit log:", err);
    }
  }
}
```

### `packages/validators/src/rbac.ts`

```typescript
// Re-exporting the Prisma enum type for consistency, though we define it manually here
// so the frontend doesn't need the @prisma/client dependency.
export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
}

export const PERMISSIONS = {
  // Workspace Governance
  WORKSPACE_UPDATE: "workspace:update",
  WORKSPACE_DELETE: "workspace:delete",
  
  // Member Management
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_ROLE_UPDATE: "member:role_update",
  
  // Governance / Audit
  AUDIT_READ: "audit:read",

  // Phase 3: Projects & Kanban
  PROJECT_CREATE: "project:create",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  
  TASK_CREATE: "task:create",
  TASK_UPDATE: "task:update",
  TASK_DELETE: "task:delete",
  
  // Phase 4: Documents & Storage
  DOCUMENT_CREATE: "document:create",
  DOCUMENT_UPDATE: "document:update",
  DOCUMENT_DELETE: "document:delete",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * The single source of truth for Role-Based Access Control (RBAC).
 * Maps each WorkspaceRole to its allowed permissions.
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  // OWNER can do absolutely everything.
  [WorkspaceRole.OWNER]: Object.values(PERMISSIONS),
  
  // ADMIN can manage the workspace and members, but cannot delete the workspace.
  [WorkspaceRole.ADMIN]: [
    PERMISSIONS.WORKSPACE_UPDATE,
    PERMISSIONS.MEMBER_INVITE,
    PERMISSIONS.MEMBER_REMOVE,
    PERMISSIONS.MEMBER_ROLE_UPDATE,
    PERMISSIONS.AUDIT_READ,
    
    // Admins can manage all operational data
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
  ],
  
  // MANAGER can manage operational data and invite users, but cannot manage admins/workspace settings.
  [WorkspaceRole.MANAGER]: [
    PERMISSIONS.MEMBER_INVITE,
    
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    // Note: Managers cannot delete entire projects
    
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
  ],
  
  // EMPLOYEE can only interact with tasks and documents, cannot manage structure.
  [WorkspaceRole.EMPLOYEE]: [
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
  ],
};
```
