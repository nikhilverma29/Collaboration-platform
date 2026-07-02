import { Request, Response } from "express";
import { SearchService } from "./search.service";
import { globalSearchSchema } from "@syncra/validators";

export class SearchController {
  
  static async search(req: Request, res: Response) {
    try {
      const parsed = globalSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const workspaceId = req.user!.workspaceId!;
      const userId = req.user!.userId;
      const { q, type, limit } = parsed.data;

      let tasks: any[] = [];
      let files: any[] = [];
      let messages: any[] = [];

      // Layer 2 focuses on Tasks and Files only. Layer 3 adds Messages.
      if (type === "ALL" || type === "TASKS") {
        tasks = await SearchService.searchTasks(workspaceId, q, limit);
      }

      if (type === "ALL" || type === "FILES") {
        files = await SearchService.searchFiles(workspaceId, q, limit);
      }

      if (type === "ALL" || type === "MESSAGES") {
        messages = await SearchService.searchMessages(workspaceId, userId, q, limit);
      }

      // Format results for a unified response
      const results = [
        ...tasks.map(t => ({ domain: "task", data: t })),
        ...files.map(f => ({ domain: "file", data: f })),
        ...messages.map(m => ({ domain: "message", data: m })),
      ];

      // Relevance ranking for ALL
      if (type === "ALL") {
        const queryLower = q.toLowerCase();
        
        results.sort((a, b) => {
          // 1. Calculate relevance score for A
          let scoreA = 0;
          const textA = (a.data.title || a.data.name || a.data.content || "").toLowerCase();
          if (textA === queryLower) scoreA += 100;
          else if (textA.includes(queryLower)) scoreA += 50;
          
          // 2. Calculate relevance score for B
          let scoreB = 0;
          const textB = (b.data.title || b.data.name || b.data.content || "").toLowerCase();
          if (textB === queryLower) scoreB += 100;
          else if (textB.includes(queryLower)) scoreB += 50;
          
          // 3. Sort by score first, then by creation date (newest first)
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          return new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime();
        });
      }

      res.status(200).json({
        success: true,
        data: results.slice(0, limit), // Ensure overall limit is respected in ALL
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
