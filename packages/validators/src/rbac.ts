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
