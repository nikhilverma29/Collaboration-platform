import { prisma } from "../../lib/db";
import { CreateProjectInput, UpdateProjectInput } from "@syncra/validators";

export class ProjectService {
  /**
   * Create a new project within a workspace.
   * Automatically creates a default "Main Board" with 4 standard columns.
   */
  static async create(workspaceId: string, userId: string, data: CreateProjectInput) {
    const project = await prisma.project.create({
      data: {
        workspaceId,
        createdById: userId,
        name: data.name,
        description: data.description,
        // Auto-add the creator as a project member
        members: {
          create: { userId },
        },
        // Auto-create a default Kanban board with standard columns
        boards: {
          create: {
            name: "Main Board",
            columns: {
              create: [
                { name: "To Do",       position: 0 },
                { name: "In Progress", position: 1 },
                { name: "In Review",   position: 2 },
                { name: "Done",        position: 3 },
              ],
            },
          },
        },
      },
      include: {
        boards: { include: { columns: { orderBy: { position: "asc" } } } },
        members: true,
      },
    });

    return project;
  }

  /**
   * List all active (non-archived) projects for a workspace.
   */
  static async listByWorkspace(workspaceId: string) {
    return prisma.project.findMany({
      where: { workspaceId, isArchived: false },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        members: { select: { userId: true } },
        _count: { select: { boards: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get full details of a single project (boards + columns).
   */
  static async getById(projectId: string, workspaceId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      include: {
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        members: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
          },
        },
        boards: {
          include: {
            columns: { orderBy: { position: "asc" } },
          },
        },
      },
    });
  }

  /**
   * Update a project's name or description.
   */
  static async update(projectId: string, workspaceId: string, data: UpdateProjectInput) {
    return prisma.project.update({
      where: { id: projectId, workspaceId },
      data,
    });
  }

  /**
   * Soft-archive a project (hidden from list, data retained).
   */
  static async archive(projectId: string, workspaceId: string) {
    return prisma.project.update({
      where: { id: projectId, workspaceId },
      data: { isArchived: true },
    });
  }

  /**
   * Permanently delete a project and all its nested data via Cascade.
   */
  static async delete(projectId: string, workspaceId: string) {
    return prisma.project.delete({
      where: { id: projectId, workspaceId },
    });
  }

  // ---------------------------------------------------------------------------
  // Project Members
  // ---------------------------------------------------------------------------

  static async addMember(projectId: string, userId: string) {
    return prisma.projectMember.create({
      data: { projectId, userId },
    });
  }

  static async removeMember(projectId: string, userId: string) {
    return prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  static async listMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, email: true } },
      },
    });
  }
}
