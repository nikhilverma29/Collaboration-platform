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
