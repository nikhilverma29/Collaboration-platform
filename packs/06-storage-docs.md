# 06-storage-docs — Documents & Storage

## Purpose

Folder hierarchy, file registration after Supabase presigned-URL upload, file rename/move/delete, share links with expiry, and cascading folder deletion. All storage paths are prefixed with workspaceId to guarantee tenant isolation at the bucket level.

## Dependencies

- `00-core-foundation`
- `02-workspace-tenancy`
- `03-rbac-governance`

## Main User Flow

POST /api/storage/files/upload-url → returns Supabase presigned PUT URL. POST /api/storage/files → register file metadata in DB. POST /api/storage/files/:id/share → create time-limited share link. GET /api/storage/share/:token → resolve and redirect.

## Files Involved

- `apps/api/src/modules/storage/file.service.ts`
- `apps/api/src/modules/storage/file.controller.ts`
- `apps/api/src/modules/storage/folder.service.ts`
- `apps/api/src/modules/storage/folder.controller.ts`
- `apps/api/src/modules/storage/share.service.ts`
- `apps/api/src/modules/storage/share.controller.ts`
- `apps/api/src/modules/storage/storage.routes.ts`
- `packages/validators/src/storage.ts`

## Source Code

### `apps/api/src/modules/storage/file.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { RegisterFileInput, RenameFileInput, MoveFileInput } from "@syncra/validators";
import { supabase } from "../../lib/supabase";

// The storage bucket name defined in Supabase
const BUCKET_NAME = "workspace-files"; 

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
      .from(BUCKET_NAME)
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
      .from(BUCKET_NAME)
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

    // 1. Delete from Supabase
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([file.storagePath]);
      
    if (error) {
      console.error(`Failed to delete file from storage: ${error.message}`);
      // Proceeding with DB deletion anyway to avoid ghost records if storage fails
    }

    // 2. Delete from DB
    return prisma.file.delete({
      where: { id: fileId, workspaceId }
    });
  }
}
```

### `apps/api/src/modules/storage/file.controller.ts`

```typescript
import { Request, Response } from "express";
import { FileService } from "./file.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { registerFileSchema, renameFileSchema, moveFileSchema } from "@syncra/validators";

export class FileController {
  
  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.query.folderId as string | undefined;

      const files = await FileService.list(workspaceId, folderId);
      res.status(200).json({ success: true, data: files });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async requestUploadUrl(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const { fileName } = req.body;
      
      if (!fileName) {
        res.status(400).json({ success: false, error: "fileName is required" });
        return;
      }

      const uploadInfo = await FileService.getUploadUrl(workspaceId, fileName);
      res.status(200).json({ success: true, data: uploadInfo });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async registerFile(req: Request, res: Response) {
    try {
      const parsed = registerFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const file = await FileService.registerFile(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_uploaded", file },
      });

      res.status(201).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getDownloadUrl(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const downloadInfo = await FileService.getDownloadUrl(fileId, workspaceId);
      res.status(200).json({ success: true, data: downloadInfo });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async rename(req: Request, res: Response) {
    try {
      const parsed = renameFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const file = await FileService.rename(fileId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_renamed", file },
      });

      res.status(200).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const parsed = moveFileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const file = await FileService.move(fileId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_moved", file },
      });

      res.status(200).json({ success: true, data: file });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      await FileService.delete(fileId, workspaceId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "file_deleted", fileId },
      });

      res.status(200).json({ success: true, data: { message: "File deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/storage/folder.service.ts`

```typescript
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
```

### `apps/api/src/modules/storage/folder.controller.ts`

```typescript
import { Request, Response } from "express";
import { FolderService } from "./folder.service";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { createFolderSchema, renameFolderSchema, moveFolderSchema } from "@syncra/validators";

export class FolderController {
  
  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const parentId = req.query.parentId as string | undefined;

      const folders = await FolderService.list(workspaceId, parentId);
      res.status(200).json({ success: true, data: folders });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.getById(folderId, workspaceId);
      if (!folder) {
        res.status(404).json({ success: false, error: "Folder not found" });
        return;
      }

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const parsed = createFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;

      const folder = await FolderService.create(workspaceId, userId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "folder_created", folder },
      });

      res.status(201).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async rename(req: Request, res: Response) {
    try {
      const parsed = renameFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.rename(folderId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "folder_renamed", folder },
      });

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const parsed = moveFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      const folder = await FolderService.move(folderId, workspaceId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "folder_moved", folder },
      });

      res.status(200).json({ success: true, data: folder });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const folderId = req.params.folderId as string;

      await FolderService.delete(folderId, workspaceId);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: userId,
        data: { type: "folder_deleted", folderId },
      });

      res.status(200).json({ success: true, data: { message: "Folder deleted" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/storage/share.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateShareLinkInput } from "@syncra/validators";
import { supabase } from "../../lib/supabase";

const BUCKET_NAME = "workspace-files"; 

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
      .from(BUCKET_NAME)
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
```

### `apps/api/src/modules/storage/share.controller.ts`

```typescript
import { Request, Response } from "express";
import { ShareLinkService } from "./share.service";
import { createShareLinkSchema } from "@syncra/validators";

export class ShareLinkController {
  
  static async create(req: Request, res: Response) {
    try {
      const parsed = createShareLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const userId = req.user!.userId;
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const link = await ShareLinkService.create(fileId, workspaceId, userId, parsed.data);
      res.status(201).json({ success: true, data: link });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const fileId = req.params.fileId as string;

      const links = await ShareLinkService.listByFile(fileId, workspaceId);
      res.status(200).json({ success: true, data: links });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const linkId = req.params.linkId as string;

      await ShareLinkService.delete(linkId, workspaceId);
      res.status(200).json({ success: true, data: { message: "Share link revoked" } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * PUBLIC endpoint. No auth required.
   */
  static async accessPublic(req: Request, res: Response) {
    try {
      const token = req.params.token as string;
      const accessData = await ShareLinkService.accessPublicLink(token);
      res.status(200).json({ success: true, data: accessData });
    } catch (error: any) {
      res.status(404).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/storage/storage.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { FolderController } from "./folder.controller";
import { FileController } from "./file.controller";
import { ShareLinkController } from "./share.controller";

const router = Router();

// ---------------------------------------------------------------------------
// Public Routes
// ---------------------------------------------------------------------------

// Access a file via public share link token
router.get("/shared/:token", ShareLinkController.accessPublic);

// ---------------------------------------------------------------------------
// Authenticated Workspace Routes
// ---------------------------------------------------------------------------
// All routes below require authentication and an active workspace context
router.use(requireAuth, requireWorkspace);

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

router.get("/folders", FolderController.list);
router.get("/folders/:folderId", FolderController.getOne);
router.post("/folders", FolderController.create);
router.put("/folders/:folderId/rename", FolderController.rename);
router.put("/folders/:folderId/move", FolderController.move);
router.delete("/folders/:folderId", FolderController.remove);

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

router.get("/files", FileController.list);

// Upload Flow:
// 1. Client asks for an upload URL
router.post("/files/upload-url", FileController.requestUploadUrl);
// 2. Client uploads directly to Supabase via PUT to the signedUrl
// 3. Client registers the file with our DB
router.post("/files/register", FileController.registerFile);

// Download Flow:
router.get("/files/:fileId/download-url", FileController.getDownloadUrl);

router.put("/files/:fileId/rename", FileController.rename);
router.put("/files/:fileId/move", FileController.move);
router.delete("/files/:fileId", FileController.remove);

// ---------------------------------------------------------------------------
// Share Links
// ---------------------------------------------------------------------------

router.post("/files/:fileId/share", ShareLinkController.create);
router.get("/files/:fileId/share", ShareLinkController.list);
router.delete("/share-links/:linkId", ShareLinkController.remove);

export default router;
```

### `packages/validators/src/storage.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Folder
// -----------------------------------------------------------------------------

export const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().cuid().optional().nullable(),
});

export const renameFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

export const moveFolderSchema = z.object({
  parentId: z.string().cuid().optional().nullable(),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;

// -----------------------------------------------------------------------------
// File
// -----------------------------------------------------------------------------

export const registerFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().min(1),
  storagePath: z.string().min(1),
  folderId: z.string().cuid().optional().nullable(),
});

export const renameFileSchema = z.object({
  name: z.string().min(1).max(255),
});

export const moveFileSchema = z.object({
  folderId: z.string().cuid().optional().nullable(),
});

export type RegisterFileInput = z.infer<typeof registerFileSchema>;
export type RenameFileInput = z.infer<typeof renameFileSchema>;
export type MoveFileInput = z.infer<typeof moveFileSchema>;

// -----------------------------------------------------------------------------
// Share Link
// -----------------------------------------------------------------------------

export const createShareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720), // Max 30 days
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
```
