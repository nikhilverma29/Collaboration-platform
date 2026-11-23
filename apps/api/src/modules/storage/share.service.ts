import { prisma } from "../../lib/db";
import { CreateShareLinkInput } from "@syncra/validators";
import { supabase, STORAGE_BUCKET } from "../../lib/supabase";

export class ShareLinkService {
  
  /**
   * Create a secure, expiring share link for a file.
   */
  static async create(fileId: string, workspaceId: string, actorId: string, data: CreateShareLinkInput) {
    // Verify file exists and belongs to workspace
    await prisma.file.findUniqueOrThrow({
      where: { id: fileId, workspaceId }
    });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + data.expiresInHours);

    return prisma.shareLink.create({
      data: {
        fileId,
        createdById: actorId,
        expiresAt,
      }
    });
  }

  /**
   * List active share links for a specific file.
   */
  static async listByFile(fileId: string, workspaceId: string) {
    // Verify file access first
    await prisma.file.findUniqueOrThrow({
      where: { id: fileId, workspaceId }
    });

    return prisma.shareLink.findMany({
      where: { fileId },
      include: {
        createdBy: { select: { id: true, displayName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Delete (revoke) a share link manually.
   */
  static async delete(linkId: string, workspaceId: string) {
    // We must ensure the user has access to the underlying file's workspace
    const link = await prisma.shareLink.findUniqueOrThrow({
      where: { id: linkId },
      include: { file: true }
    });

    if (link.file.workspaceId !== workspaceId) {
      throw new Error("Unauthorized");
    }

    return prisma.shareLink.delete({
      where: { id: linkId }
    });
  }

  /**
   * Public endpoint logic: Access a file via the secure token.
   * Does NOT require authentication or workspace context.
   */
  static async accessPublicLink(token: string) {
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { file: true }
    });

    if (!link) {
      throw new Error("Invalid or expired link");
    }

    if (link.expiresAt < new Date()) {
      // Lazy cleanup of expired link
      await prisma.shareLink.delete({ where: { id: link.id } }).catch(() => {});
      throw new Error("Link has expired");
    }

    // Generate a temporary Supabase URL (valid for 5 mins) so the client can download it
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(link.file.storagePath, 60 * 5);

    if (error || !data) {
      throw new Error(`Storage error: ${error?.message}`);
    }

    return {
      file: link.file,
      downloadUrl: data.signedUrl
    };
  }
}
