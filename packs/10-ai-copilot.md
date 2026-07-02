# 10-ai-copilot — AI Copilot

## Purpose

Vercel AI SDK integration with OpenAI (gpt-4o). Five features: (1) streaming workspace-aware chat, (2) channel message summarization, (3) structured task enrichment using generateObject + Zod schema, (4) document Q&A via RAG pattern with Supabase Storage, (5) workspace assistant that injects live task context into the system prompt. All endpoints rate-limited (20 req/15min) to prevent financial DoS.

## Dependencies

- `00-core-foundation`
- `02-workspace-tenancy`
- `05-projects-kanban`
- `06-storage-docs`
- `07-chat-communication`

## Main User Flow

POST /api/ai/chat → streamText → pipe to response. POST /api/ai/summarize/channel/:id → fetch messages → generateText. POST /api/ai/enrich/task/:id → generateObject (structured JSON). POST /api/ai/qa/document/:id → download from Supabase → generateText with doc context. POST /api/ai/assistant → fetch open tasks → inject into system prompt → streamText.

## Files Involved

- `apps/api/src/modules/ai/ai.service.ts`
- `apps/api/src/modules/ai/ai.controller.ts`
- `apps/api/src/modules/ai/ai.routes.ts`

## Source Code

### `apps/api/src/modules/ai/ai.service.ts`

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText, generateText, generateObject } from "ai";
import { z } from "zod";
import { prisma } from "../../lib/db";
import { supabase } from "../../lib/supabase";
import { WorkspaceRole } from "@syncra/validators";

export class AiService {
  /**
   * Generates a context-aware system prompt for a specific user in a workspace.
   */
  static async getSystemPrompt(workspaceId: string, userId: string, role: WorkspaceRole): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    
    return `You are Syncra Copilot, an intelligent, helpful AI assistant built into the Syncra collaboration platform.
Your goal is to help the user manage their tasks, understand their team's communication, and find information quickly.

Current Context:
- User: ${user?.displayName || "Unknown User"}
- Role: ${role}
- Workspace: ${workspace?.name || "Unknown Workspace"}

Instructions:
- Be concise and professional.
- When summarizing, focus on key decisions, action items, and outstanding questions.
- If you don't know the answer or lack context, say so clearly.`;
  }

  /**
   * Layer 1: Skeleton streaming endpoint for general chat.
   * We use the Vercel AI SDK to stream text back to the client.
   */
  static async streamChat(workspaceId: string, userId: string, role: WorkspaceRole, messages: any[]): Promise<any> {
    const systemPrompt = await this.getSystemPrompt(workspaceId, userId, role);

    const result = streamText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages,
    });

    return result;
  }

  /**
   * Layer 2: Message Summarization
   * Fetches the last N messages from a channel and asks the model to summarize them.
   */
  static async summarizeChannel(workspaceId: string, userId: string, role: WorkspaceRole, channelId: string, limit: number = 50) {
    // 1. Verify access (Tenant isolation & channel membership)
    const channel = await prisma.channel.findUnique({
      where: { id: channelId, workspaceId },
      include: {
        members: { where: { userId } },
      }
    });

    if (!channel) {
      throw new Error("Channel not found");
    }

    if (channel.type !== "PUBLIC" && channel.members.length === 0) {
      throw new Error("Forbidden: You do not have access to this channel.");
    }

    // 2. Fetch the last N messages
    const recentMessages = await prisma.message.findMany({
      where: { channelId, workspaceId, parentId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: { select: { displayName: true } },
      }
    });

    if (recentMessages.length === 0) {
      return "No messages to summarize in this channel yet.";
    }

    // Sort chronologically for the model
    recentMessages.reverse();

    // 3. Format messages for the prompt
    const formattedTranscript = recentMessages
      .map((msg) => `[${msg.createdAt.toISOString()}] ${msg.author.displayName}: ${msg.content}`)
      .join("\n");

    const systemPrompt = await this.getSystemPrompt(workspaceId, userId, role);

    // 4. Generate the summary using generateText (non-streaming for now, or stream if preferred)
    const result = await generateText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      prompt: `Please provide a concise summary of the following conversation transcript from the #${channel.name} channel. Highlight any key decisions, action items, or important updates.\n\nTranscript:\n${formattedTranscript}`,
    });

    return result.text;
  }

  /**
   * Layer 3: Task Enrichment
   * Takes a task's title and description, and asks the model to suggest
   * missing acceptance criteria, complexity, and relevant labels.
   */
  static async enrichTask(workspaceId: string, userId: string, role: WorkspaceRole, taskId: string) {
    // 1. Verify access to the task
    const task = await prisma.task.findUnique({
      where: { id: taskId, workspaceId }
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { name: true }
    });

    const systemPrompt = await this.getSystemPrompt(workspaceId, userId, role);

    // 2. Request structured output
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      system: systemPrompt,
      prompt: `Please enrich the following task. Suggest 3-5 missing acceptance criteria, an estimated complexity score (1-5, where 5 is highly complex), and up to 3 relevant concise labels.

Task Title: ${task.title}
Task Description: ${task.description || "No description provided"}
Project: ${project?.name || "Unknown"}`,
      schema: z.object({
        acceptanceCriteria: z.array(z.string()).describe("List of suggested acceptance criteria"),
        complexityEstimate: z.number().min(1).max(5).describe("Estimated complexity from 1 to 5"),
        suggestedLabels: z.array(z.string()).max(3).describe("Up to 3 relevant labels"),
      }),
    });

    return object;
  }

  /**
   * Layer 4: Document Q&A (RAG Pattern)
   * Fetches file content from Supabase storage and answers questions about it.
   */
  static async qaDocument(workspaceId: string, userId: string, role: WorkspaceRole, fileId: string, question: string) {
    // 1. Verify access to the file
    const file = await prisma.file.findUnique({
      where: { id: fileId, workspaceId }
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Only allow text-based files for now to keep things simple
    if (!file.mimeType.includes("text") && !file.mimeType.includes("markdown") && !file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      throw new Error("Only text or markdown documents are supported for Q&A right now.");
    }

    // 2. Fetch the file content from Supabase
    // We assume BUCKET_NAME is "workspace-files" as used in file.service.ts
    const { data, error } = await supabase.storage
      .from("workspace-files")
      .download(file.storagePath);

    if (error || !data) {
      throw new Error("Failed to download file from storage.");
    }

    const fileContent = await data.text();

    const systemPrompt = await this.getSystemPrompt(workspaceId, userId, role);

    // 3. Ask the model using the document as context
    const result = await generateText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      prompt: `You are answering a question about a specific document. Use the provided document content as your primary context.

Document Name: ${file.name}

Document Content:
---
${fileContent.substring(0, 10000)} // Chunking to fit context window safely
---

Question: ${question}`,
    });

    return result.text;
  }

  /**
   * Layer 5: General Workspace Assistant
   * A chat assistant with full workspace context (user's open tasks, recent activity).
   */
  static async workspaceAssistant(workspaceId: string, userId: string, role: WorkspaceRole, messages: any[]): Promise<any> {
    // 1. Fetch deep context for the user in this workspace
    
    // Get their open tasks
    const openTasks = await prisma.task.findMany({
      where: { workspaceId, assigneeId: userId, isArchived: false, status: { not: "DONE" } },
      select: { title: true, status: true, priority: true, projectId: true },
      take: 10
    });

    // Fetch project names
    const projectIds = [...new Set(openTasks.map(t => t.projectId))];
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true }
    });
    const projectMap = new Map(projects.map(p => [p.id, p.name]));

    // Format tasks for prompt
    const tasksContext = openTasks.length > 0 
      ? openTasks.map(t => `- [${projectMap.get(t.projectId) || 'No Project'}] ${t.title} (Status: ${t.status}, Priority: ${t.priority})`).join("\n")
      : "No open tasks.";

    const baseSystemPrompt = await this.getSystemPrompt(workspaceId, userId, role);
    
    // Inject deep context into the system prompt
    const richSystemPrompt = `${baseSystemPrompt}

Deep Workspace Context:
Here are the user's currently open tasks:
${tasksContext}

When the user asks questions like "What are my tasks?" or "What's on my plate?", refer directly to this context.`;

    // 2. Stream the response
    const result = streamText({
      model: openai("gpt-4o"),
      system: richSystemPrompt,
      messages,
    });

    return result;
  }
}
```

### `apps/api/src/modules/ai/ai.controller.ts`

```typescript
import { Request, Response } from "express";
import { AiService } from "./ai.service";
import { WorkspaceRole } from "@syncra/validators";

export class AiController {
  
  /**
   * Layer 1: Streaming Chat Endpoint
   */
  static async chat(req: Request, res: Response) {
    try {
      const { messages } = req.body;
      
      if (!Array.isArray(messages)) {
        res.status(400).json({ success: false, error: "Messages array is required." });
        return;
      }

      const result = await AiService.streamChat(
        req.user!.workspaceId!,
        req.user!.userId,
        req.user!.role as WorkspaceRole,
        messages
      );

      // result.pipeDataStreamToResponse() automatically sets the correct headers for the Vercel AI SDK
      result.pipeTextStreamToResponse(res);
      
    } catch (error: any) {
      // Note: If streaming has already started, changing status code might fail, 
      // but in this layer 1 skeleton we handle errors before streaming usually.
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      } else {
        console.error("AI Streaming Error:", error);
      }
    }
  }

  /**
   * Layer 2: Summarize Channel
   */
  static async summarizeChannel(req: Request, res: Response) {
    try {
      const channelId = req.params.channelId as string;
      
      // Optional limit from query params
      const limitParam = parseInt(req.query.limit as string);
      const limit = isNaN(limitParam) ? 50 : Math.min(limitParam, 100);

      const summary = await AiService.summarizeChannel(
        req.user!.workspaceId!,
        req.user!.userId,
        req.user!.role as WorkspaceRole,
        channelId,
        limit
      );

      res.status(200).json({ success: true, data: { summary } });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        res.status(403).json({ success: false, error: error.message });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Layer 3: Enrich Task
   */
  static async enrichTask(req: Request, res: Response) {
    try {
      const taskId = req.params.taskId as string;
      const enrichment = await AiService.enrichTask(
        req.user!.workspaceId!,
        req.user!.userId,
        req.user!.role as WorkspaceRole,
        taskId
      );

      res.status(200).json({ success: true, data: enrichment });
    } catch (error: any) {
      if (error.message.includes("not found")) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Layer 4: Document Q&A
   */
  static async qaDocument(req: Request, res: Response) {
    try {
      const fileId = req.params.fileId as string;
      const { question } = req.body;

      if (!question) {
        res.status(400).json({ success: false, error: "Question is required." });
        return;
      }

      const answer = await AiService.qaDocument(
        req.user!.workspaceId!,
        req.user!.userId,
        req.user!.role as WorkspaceRole,
        fileId,
        question
      );

      res.status(200).json({ success: true, data: { answer } });
    } catch (error: any) {
      if (error.message.includes("not found")) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      if (error.message.includes("Only text or markdown")) {
        res.status(415).json({ success: false, error: error.message });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Layer 5: Workspace Assistant
   */
  static async workspaceAssistant(req: Request, res: Response) {
    try {
      const { messages } = req.body;
      
      if (!Array.isArray(messages)) {
        res.status(400).json({ success: false, error: "Messages array is required." });
        return;
      }

      const result = await AiService.workspaceAssistant(
        req.user!.workspaceId!,
        req.user!.userId,
        req.user!.role as WorkspaceRole,
        messages
      );

      result.pipeTextStreamToResponse(res);
      
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      } else {
        console.error("AI Assistant Streaming Error:", error);
      }
    }
  }
}
```

### `apps/api/src/modules/ai/ai.routes.ts`

```typescript
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
```
