import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { SearchController } from "./search.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Global unified search (queries can specify type=ALL, TASKS, FILES, etc.)
router.get("/", SearchController.search);

export default router;
