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

