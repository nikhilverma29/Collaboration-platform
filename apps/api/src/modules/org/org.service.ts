import { prisma } from "../../lib/db";
import { SetManagerInput } from "@syncra/validators";

export class OrgService {
  
  /**
   * Assign a manager to a user.
   * Checks for circular dependencies (e.g., you can't report to someone who reports to you).
   */
  static async setManager(workspaceId: string, userId: string, data: SetManagerInput) {
    const { managerId } = data;

    // You can't be your own manager
    if (managerId === userId) {
      throw new Error("Cannot set yourself as your manager");
    }

    if (managerId) {
      // Verify manager exists in this workspace
      const manager = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: managerId } },
      });
      if (!manager) {
        throw new Error("Manager must be a member of this workspace");
      }

      // Check for circular dependency (simple climb up the tree)
      let currentManagerId: string | null = managerId;
      while (currentManagerId) {
        if (currentManagerId === userId) {
          throw new Error("Circular reporting line detected");
        }
        const managerRecord: { managerId: string | null } | null = await prisma.user.findUnique({
          where: { id: currentManagerId },
          select: { managerId: true },
        });
        currentManagerId = managerRecord?.managerId || null;
      }
    }

    // Update the user
    return prisma.user.update({
      where: { id: userId },
      data: { managerId },
      select: {
        id: true,
        displayName: true,
        manager: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Fetch the flat org chart (all users with their managerId) for the frontend to build the tree.
   */
  static async getOrgChart(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            managerId: true,
          },
        },
      },
    });

    return members.map(m => ({
      ...m.user,
      role: m.role,
    }));
  }
}
