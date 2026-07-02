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
