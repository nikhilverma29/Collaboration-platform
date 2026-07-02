# 02-workspace-tenancy — Multi-Tenancy & Workspace System

## Purpose

Workspace creation, invite-code based joining, workspace switching (re-issues JWT with workspaceId + role), and member management. The requireWorkspace middleware enforces that all subsequent API calls carry tenant context.

## Dependencies

- `00-core-foundation`
- `01-auth-sessions`

## Main User Flow

POST /api/workspaces → create + set as OWNER. POST /api/workspaces/join → validate invite code → add as EMPLOYEE. POST /api/workspaces/:id/switch → re-sign JWT with workspaceId and role embedded.

## Files Involved

- `apps/api/src/modules/workspace/workspace.service.ts`
- `apps/api/src/modules/workspace/workspace.controller.ts`
- `apps/api/src/modules/workspace/workspace.routes.ts`
- `apps/api/src/middleware/tenant.ts`
- `packages/validators/src/workspace.ts`

## Source Code

### `apps/api/src/modules/workspace/workspace.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateWorkspaceInput, JoinWorkspaceInput } from "@syncra/validators";

export class WorkspaceService {
  /**
   * Creates a new workspace and automatically adds the creator as the OWNER.
   * This is done in a transaction to ensure database consistency.
   */
  static async createWorkspace(userId: string, data: CreateWorkspaceInput) {
    // Generate a URL-safe slug from the name
    const baseSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    const slug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Create workspace and owner membership atomically
    return await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          slug,
          ownerId: userId,
        }
      });
      
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: userId,
          role: "OWNER",
        }
      });
      
      return workspace;
    });
  }
  
  /**
   * Allows a user to join a workspace using an invite code.
   * New members default to the EMPLOYEE role.
   */
  static async joinWorkspace(userId: string, data: JoinWorkspaceInput) {
    const workspace = await prisma.workspace.findUnique({
      where: { inviteCode: data.inviteCode }
    });
    
    if (!workspace) {
      throw new Error("Invalid invite code");
    }
    
    // Check if user is already a member
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: userId
        }
      }
    });
    
    if (existing) {
      throw new Error("You are already a member of this workspace");
    }
    
    // Create membership as EMPLOYEE
    const membership = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: userId,
        role: "EMPLOYEE"
      }
    });
    
    return { workspace, membership };
  }
  
  /**
   * Lists all workspaces the user is a member of.
   */
  static async listUserWorkspaces(userId: string) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: true
      },
      orderBy: {
        joinedAt: "asc"
      }
    });
    
    return memberships.map(m => ({
      role: m.role,
      joinedAt: m.joinedAt,
      workspace: m.workspace
    }));
  }
}
```

### `apps/api/src/modules/workspace/workspace.controller.ts`

```typescript
import { Request, Response } from "express";
import { WorkspaceService } from "./workspace.service";
import { createWorkspaceSchema, joinWorkspaceSchema } from "@syncra/validators";
import { prisma } from "../../lib/db";
import { signAccessToken } from "../../lib/jwt";
import { AuditService } from "../audit/audit.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class WorkspaceController {
  /**
   * Creates a new workspace.
   */
  static async create(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = createWorkspaceSchema.parse(req.body);
      
      const workspace = await WorkspaceService.createWorkspace(userId, data);
      
      res.status(201).json({ success: true, data: workspace });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Joins a workspace via invite code.
   */
  static async join(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = joinWorkspaceSchema.parse(req.body);
      
      const result = await WorkspaceService.joinWorkspace(userId, data);
      
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Lists all workspaces for the authenticated user.
   */
  static async list(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaces = await WorkspaceService.listUserWorkspaces(userId);
      
      res.status(200).json({ success: true, data: workspaces });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Switch into a workspace.
   * Issues a new access token that includes the workspaceId and role in the payload.
   */
  static async switch(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.params.workspaceId as string;
      
      if (!workspaceId) {
        res.status(400).json({ success: false, error: "Workspace ID is required" });
        return;
      }

      // Verify membership to ensure they are allowed to switch into this tenant
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
      });
      
      if (!membership) {
        res.status(403).json({ success: false, error: "Forbidden - Not a member of this workspace" });
        return;
      }
      
      // Issue a new, tenant-aware access token
      const accessToken = signAccessToken({
        userId,
        workspaceId,
        role: membership.role,
        sessionId: req.user!.sessionId
      });
      
      // Update just the access token cookie
      res.cookie("syncra_access", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 15 * 60 * 1000 // 15 minutes
      });
      
      res.status(200).json({ 
        success: true, 
        data: { workspaceId, role: membership.role } 
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Update a workspace.
   * Requires WORKSPACE_UPDATE permission (checked by middleware).
   * Demonstrates Audit Logging.
   */
  static async update(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.params.workspaceId as string;
      const { name } = req.body;
      
      const oldWorkspace = await prisma.workspace.findUnique({ where: { id: workspaceId }});
      
      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name }
      });
      
      // Write Audit Log
      await AuditService.log({
        workspaceId,
        actorId: userId,
        action: "workspace.update",
        metadata: {
          oldName: oldWorkspace?.name,
          newName: workspace.name
        }
      });
      
      // Broadcast realtime event
      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: workspace
      });
      
      res.status(200).json({ success: true, data: workspace });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/workspace/workspace.routes.ts`

```typescript
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

// Update a workspace (Requires Tenant Context and WORKSPACE_UPDATE permission)
router.put(
  "/:workspaceId",
  requireWorkspace,
  requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
  WorkspaceController.update
);

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

export default router;
```

### `apps/api/src/middleware/tenant.ts`

```typescript
import { Request, Response, NextFunction } from "express";

/**
 * Middleware: requireWorkspace
 * Ensures the authenticated user has an active workspace context.
 * Must be used AFTER `requireAuth`.
 * Checks the JWT payload for `workspaceId` and `role`.
 */
export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized - Authentication required" });
    return;
  }

  if (!req.user.workspaceId || !req.user.role) {
    res.status(403).json({ success: false, error: "Forbidden - Active workspace context required" });
    return;
  }

  next();
}
```

### `packages/validators/src/workspace.ts`

```typescript
import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters long"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const joinWorkspaceSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
```
