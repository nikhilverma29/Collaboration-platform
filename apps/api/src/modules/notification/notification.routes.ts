import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";

const router = Router();

router.use(requireAuth);
router.use(requireWorkspace);

router.get("/", NotificationController.list);
router.put("/read-all", NotificationController.markAllAsRead);
router.put("/:id/read", NotificationController.markAsRead);
router.delete("/:id", NotificationController.delete);

export default router;
