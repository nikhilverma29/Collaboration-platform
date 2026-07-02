# 08-search-discovery — Global Search

## Purpose

Cross-entity full-text search across tasks, messages, and files — all scoped to the active workspace. A single query endpoint fans out to three Prisma queries and merges the results into a typed union response.

## Dependencies

- `00-core-foundation`
- `02-workspace-tenancy`
- `05-projects-kanban`
- `06-storage-docs`
- `07-chat-communication`

## Main User Flow

GET /api/search?q=term → SearchService.search(workspaceId, q) → concurrent prisma.task.findMany + prisma.message.findMany + prisma.file.findMany → merge → return typed hits array.

## Files Involved

- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/search/search.controller.ts`
- `apps/api/src/modules/search/search.routes.ts`
- `packages/validators/src/search.ts`

## Source Code

### `apps/api/src/modules/search/search.service.ts`

```typescript
import { prisma } from "../../lib/db";

export class SearchService {

  /**
   * Format the search query for Postgres to_tsquery (using OR logic).
   * Strips special characters to prevent syntax errors.
   */
  private static formatQuery(q: string): string {
    const cleaned = q.replace(/[^a-zA-Z0-9 \-]/g, "").trim();
    if (!cleaned) return q; // fallback to original if completely stripped
    return cleaned.split(/\s+/).join(" | ");
  }

  /**
   * Search tasks by title or description using full-text search.
   */
  static async searchTasks(workspaceId: string, q: string, limit: number) {
    const query = this.formatQuery(q);

    // If formatting wiped the query (e.g., only symbols), fallback to simple contains
    const searchFilter = query === q && !query.match(/[a-zA-Z0-9]/)
      ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] }
      : { OR: [{ title: { search: query } }, { description: { search: query } }] };

    return prisma.task.findMany({
      where: {
        workspaceId,
        ...searchFilter,
      },
      take: limit,
      include: {
        assignee: { select: { id: true, displayName: true } },
      },
      // Using createdAt as a proxy for ranking if FTS doesn't expose ts_rank directly via Prisma
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Search files by name.
   */
  static async searchFiles(workspaceId: string, q: string, limit: number) {
    const query = this.formatQuery(q);

    const searchFilter = query === q && !query.match(/[a-zA-Z0-9]/)
      ? { name: { contains: q, mode: "insensitive" as const } }
      : { name: { search: query } };

    return prisma.file.findMany({
      where: {
        workspaceId,
        ...searchFilter,
      },
      take: limit,
      include: {
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Search messages by content.
   * Access Guard: Only returns messages from PUBLIC channels OR channels the user is a member of.
   */
  static async searchMessages(workspaceId: string, userId: string, q: string, limit: number) {
    const query = this.formatQuery(q);

    const searchFilter = query === q && !query.match(/[a-zA-Z0-9]/)
      ? { content: { contains: q, mode: "insensitive" as const } }
      : { content: { search: query } };

    return prisma.message.findMany({
      where: {
        workspaceId,
        isDeleted: false, // Don't search tombstoned messages
        channel: {
          OR: [
            { type: "PUBLIC" },
            { members: { some: { userId } } }, // User must be a member of PRIVATE/DIRECT
          ],
        },
        ...searchFilter,
      },
      take: limit,
      include: {
        author: { select: { id: true, displayName: true } },
        channel: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
```

### `apps/api/src/modules/search/search.controller.ts`

```typescript
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
```

### `apps/api/src/modules/search/search.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { SearchController } from "./search.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Global unified search (queries can specify type=ALL, TASKS, FILES, etc.)
router.get("/", SearchController.search);

export default router;
```

### `packages/validators/src/search.ts`

```typescript
import { z } from "zod";

export const SearchTypeSchema = z.enum(["ALL", "TASKS", "FILES", "MESSAGES"]);

export const globalSearchSchema = z.object({
  q: z.string().min(1, "Search query is required"),
  type: SearchTypeSchema.default("ALL"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchType = z.infer<typeof SearchTypeSchema>;
export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
```
