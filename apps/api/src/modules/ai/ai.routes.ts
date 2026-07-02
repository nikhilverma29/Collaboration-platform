import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { AiController } from "./ai.controller";

import { rateLimit } from "express-rate-limit";

const router = Router();

// Strict AI Rate Limiter: 20 requests per 15 minutes per IP to prevent financial DoS via OpenAI API abuse
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Too many AI requests — please try again later." },
});

// All AI features require auth, a selected workspace context, and strict rate limiting
router.use(requireAuth, requireWorkspace, aiLimiter);

// Layer 1: General Copilot Chat
router.post("/chat", AiController.chat);

// Layer 2: Summarize a specific channel
router.post("/summarize/channel/:channelId", AiController.summarizeChannel);

// Layer 3: Enrich Task
router.post("/enrich/task/:taskId", AiController.enrichTask);

// Layer 4: Document Q&A
router.post("/qa/document/:fileId", AiController.qaDocument);

// Layer 5: Workspace Assistant
router.post("/assistant", AiController.workspaceAssistant);

export default router;
