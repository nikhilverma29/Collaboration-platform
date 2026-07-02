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
