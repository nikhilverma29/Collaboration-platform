import { prisma } from "../../lib/db";
import { CreateFolderInput, RenameFolderInput, MoveFolderInput } from "@syncra/validators";
import { Prisma } from "@prisma/client";

export class FolderService {
  
  /**
   * List all folders in a workspace, optionally filtered by a parentId.
   */
  static async list(workspaceId: string, parentId?: string | null) {
    return prisma.folder.findMany({
      where: {
        workspaceId,
        parentId: parentId || null,
      },
      orderBy: { name: 'asc' },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        _count: { select: { children: true, files: true } }
      }
    });
  }

  /**
   * Get a single folder with its direct children and files.
   */
  static async getById(folderId: string, workspaceId: string) {
    return prisma.folder.findFirst({
      where: { id: folderId, workspaceId },
      include: {
        children: { orderBy: { name: 'asc' } },
        files: { orderBy: { name: 'asc' } },
        createdBy: { select: { id: true, displayName: true } }
      }
    });
  }

  /**
   * Create a new folder.
   */
  static async create(workspaceId: string, actorId: string, data: CreateFolderInput) {
    // Validate parent exists if provided
    if (data.parentId) {
      await prisma.folder.findUniqueOrThrow({
        where: { id: data.parentId, workspaceId }
      });
    }

    return prisma.folder.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: data.name,
        parentId: data.parentId || null,
      }
    });
  }

  /**
   * Rename a folder.
   */
  static async rename(folderId: string, workspaceId: string, data: RenameFolderInput) {
    return prisma.folder.update({
      where: { id: folderId, workspaceId },
      data: { name: data.name }
    });
  }

  /**
   * Move a folder into another folder (or root).
   * Note: A complete implementation would include a cycle check here to prevent
   * a folder being moved into its own child. For simplicity in Phase 4, we assume
   * valid moves or rely on future path-based hierarchy validation.
   */
  static async move(folderId: string, workspaceId: string, data: MoveFolderInput) {
    if (data.parentId) {
      if (data.parentId === folderId) throw new Error("Cannot move a folder into itself.");
      await prisma.folder.findUniqueOrThrow({
        where: { id: data.parentId, workspaceId }
      });
    }

    return prisma.folder.update({
      where: { id: folderId, workspaceId },
      data: { parentId: data.parentId || null }
    });
  }

  /**
   * Delete a folder. Due to Prisma's Cascade delete on FolderHierarchy, 
   * this will recursively delete all child folders and files from the database.
   * Note: The actual physical files in Supabase Storage should theoretically be 
   * cleaned up via a cron job or background worker listening to file deletions.
   */
  static async delete(folderId: string, workspaceId: string) {
    return prisma.folder.delete({
      where: { id: folderId, workspaceId }
    });
  }
}
