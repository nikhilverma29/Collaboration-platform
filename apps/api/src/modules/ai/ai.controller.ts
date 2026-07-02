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
