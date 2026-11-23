import { prisma } from "../../lib/db";
import { CreateFolderInput, RenameFolderInput, MoveFolderInput } from "@syncra/validators";
import { supabase, STORAGE_BUCKET } from "../../lib/supabase";

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
      orderBy: { name: "asc" },
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
        children: { orderBy: { name: "asc" } },
        files: { orderBy: { name: "asc" } },
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
   * Performs a full ancestor-chain cycle check to prevent a folder from being
   * moved into its own descendant (which would corrupt the hierarchy).
   */
  static async move(folderId: string, workspaceId: string, data: MoveFolderInput) {
    if (data.parentId) {
      if (data.parentId === folderId) {
        throw new Error("Cannot move a folder into itself.");
      }

      // Verify target parent exists in this workspace
      await prisma.folder.findUniqueOrThrow({
        where: { id: data.parentId, workspaceId }
      });

      // Walk up the ancestor chain of the target parent.
      // If we encounter folderId, a cycle would be created.
      let currentId: string | null = data.parentId;
      while (currentId !== null) {
        const ancestor: { parentId: string | null } | null = await prisma.folder.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });
        if (!ancestor) break;
        if (ancestor.parentId === folderId) {
          throw new Error("Cannot move a folder into one of its own descendants.");
        }
        currentId = ancestor.parentId;
      }
    }

    return prisma.folder.update({
      where: { id: folderId, workspaceId },
      data: { parentId: data.parentId || null }
    });
  }

  /**
   * Collect all file storagePaths from a folder and all its descendants recursively.
   * Used to clean up Supabase storage before a cascade delete.
   */
  private static async collectDescendantStoragePaths(folderId: string): Promise<string[]> {
    const paths: string[] = [];

    // Collect files in this folder
    const files = await prisma.file.findMany({
      where: { folderId },
      select: { storagePath: true },
    });
    paths.push(...files.map(f => f.storagePath));

    // Recurse into child folders
    const children = await prisma.folder.findMany({
      where: { parentId: folderId },
      select: { id: true },
    });
    for (const child of children) {
      const childPaths = await FolderService.collectDescendantStoragePaths(child.id);
      paths.push(...childPaths);
    }

    return paths;
  }

  /**
   * Delete a folder and all its contents.
   * First removes all descendant files from Supabase Storage to prevent ghost files,
   * then deletes the folder record (Prisma cascade handles the DB cleanup).
   */
  static async delete(folderId: string, workspaceId: string) {
    // Verify the folder exists and belongs to this workspace
    await prisma.folder.findUniqueOrThrow({ where: { id: folderId, workspaceId } });

    // Collect all storage paths before the DB cascade removes the records
    const storagePaths = await FolderService.collectDescendantStoragePaths(folderId);

    // Delete physical files from Supabase Storage before the DB cascade
    if (storagePaths.length > 0) {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths);

      if (error) {
        // Throw to prevent the DB delete — partial storage cleanup is worse than no cleanup
        throw new Error(`Failed to delete files from storage: ${error.message}. Folder not deleted.`);
      }
    }

    // Now safe to delete — Prisma cascade handles child folders and file records
    return prisma.folder.delete({
      where: { id: folderId, workspaceId }
    });
  }
}

