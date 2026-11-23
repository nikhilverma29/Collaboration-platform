import { prisma } from "../../lib/db";
import { CreateWorkspaceInput, JoinWorkspaceInput } from "@syncra/validators";

export type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  role: string;
};

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
  /**
   * Returns a user's membership record for a given workspace.
   * Used by the workspace switch flow to verify access and read the user's role.
   * Returns null if the user is not a member.
   */
  static async getMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    return prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { workspaceId: true, userId: true, role: true },
    });
  }

  /**
   * Updates the workspace name.
   * Returns both the old and updated workspace so the caller can log the change.
   */
  static async update(workspaceId: string, name: string) {
    const oldWorkspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { name },
    });

    return { oldWorkspace, workspace };
  }

  /**
   * Gets aggregated stats for the workspace dashboard.
   */
  static async getSummary(workspaceId: string) {
    const [memberCount, openTasksCount, recentFilesCount, recentMessagesCount] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.task.count({ where: { workspaceId, status: { not: "DONE" }, isArchived: false } }),
      prisma.file.count({ where: { workspaceId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      prisma.message.count({ where: { workspaceId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
    ]);
    
    // Online members would be queried from SocketGateway, but for HTTP API we just return DB stats
    return {
      memberCount,
      openTasksCount,
      recentFilesCount,
      recentMessagesCount
    };
  }

  /**
   * List all members of a workspace.
   */
  static async getMembers(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { joinedAt: "asc" }
    });
    return members.map(m => ({
      ...m.user,
      role: m.role,
      joinedAt: m.joinedAt
    }));
  }

  /**
   * Remove a member from the workspace.
   */
  static async removeMember(workspaceId: string, userIdToRemove: string) {
    // Prevent removing the owner
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (workspace?.ownerId === userIdToRemove) {
      throw new Error("Cannot remove the workspace owner");
    }

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId, userId: userIdToRemove }
      }
    });
  }

  /**
   * Get audit logs for a workspace.
   */
  static async getAuditLogs(workspaceId: string) {
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId },
      include: {
        actor: { select: { id: true, displayName: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return logs;
  }
}
