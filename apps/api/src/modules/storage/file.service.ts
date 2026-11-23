import { prisma } from "../../lib/db";
import { RegisterFileInput, RenameFileInput, MoveFileInput } from "@syncra/validators";
import { supabase, STORAGE_BUCKET } from "../../lib/supabase";

export class FileService {
  
  /**
   * List files in a workspace, optionally filtered by folderId.
   */
  static async list(workspaceId: string, folderId?: string | null) {
    return prisma.file.findMany({
      where: {
        workspaceId,
        folderId: folderId || null,
      },
      orderBy: { name: 'asc' },
      include: {
        createdBy: { select: { id: true, displayName: true } },
      }
    });
  }

  /**
   * Get a presigned PUT URL allowing the frontend to upload a file directly to Supabase.
   */
  static async getUploadUrl(workspaceId: string, fileName: string) {
    // Generate a secure, randomized storage path to prevent overwrites
    const uniqueId = Math.random().toString(36).substring(2, 15);
    const storagePath = `${workspaceId}/${uniqueId}-${fileName.replace(/\s+/g, "_")}`;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      throw new Error(`Failed to generate upload URL: ${error?.message}`);
    }

    return {
      signedUrl: data.signedUrl,
      storagePath, // The frontend must send this back when registering the file
    };
  }

  /**
   * Register a file in the database AFTER it has been successfully uploaded to Supabase.
   */
  static async registerFile(workspaceId: string, actorId: string, data: RegisterFileInput) {
    // Validate that the storagePath starts with this workspace's ID prefix.
    // The server generates paths as `{workspaceId}/{uniqueId}-{filename}` in getUploadUrl().
    // Rejecting paths that don't match prevents cross-workspace path poisoning.
    if (!data.storagePath.startsWith(`${workspaceId}/`)) {
      throw new Error("Invalid storagePath: path does not belong to this workspace.");
    }

    if (data.folderId) {
      await prisma.folder.findUniqueOrThrow({
        where: { id: data.folderId, workspaceId }
      });
    }

    return prisma.file.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: data.name,
        size: data.size,
        mimeType: data.mimeType,
        storagePath: data.storagePath,
        folderId: data.folderId || null,
      }
    });
  }

  /**
   * Get a short-lived presigned GET URL for downloading/viewing a file.
   */
  static async getDownloadUrl(fileId: string, workspaceId: string) {
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: fileId, workspaceId }
    });

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(file.storagePath, 60 * 60); // 1 hour expiry

    if (error || !data) {
      throw new Error(`Failed to generate download URL: ${error?.message}`);
    }

    return {
      downloadUrl: data.signedUrl,
      file
    };
  }

  /**
   * Rename a file (metadata only, physical file in Supabase keeps its storagePath).
   */
  static async rename(fileId: string, workspaceId: string, data: RenameFileInput) {
    return prisma.file.update({
      where: { id: fileId, workspaceId },
      data: { name: data.name }
    });
  }

  /**
   * Move a file into another folder.
   */
  static async move(fileId: string, workspaceId: string, data: MoveFileInput) {
    if (data.folderId) {
      await prisma.folder.findUniqueOrThrow({
        where: { id: data.folderId, workspaceId }
      });
    }

    return prisma.file.update({
      where: { id: fileId, workspaceId },
      data: { folderId: data.folderId || null }
    });
  }

  /**
   * Delete a file from the database and from Supabase Storage.
   */
  static async delete(fileId: string, workspaceId: string) {
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: fileId, workspaceId }
    });

    // 1. Delete from Supabase first — if this fails we abort to prevent ghost files
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([file.storagePath]);
      
    if (error) {
      throw new Error(`Failed to delete file from storage: ${error.message}. Database record preserved.`);
    }

    // 2. Delete from DB
    return prisma.file.delete({
      where: { id: fileId, workspaceId }
    });
  }
}
