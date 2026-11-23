import { prisma } from "../../lib/db";
import { CreateColumnInput, UpdateColumnInput } from "@syncra/validators";

export class ColumnService {
  /**
   * List all columns in a board, ordered by position.
   * Verifies the board belongs to the requesting workspace.
   */
  static async listByBoard(boardId: string, workspaceId: string) {
    // Verify board belongs to this workspace via project chain
    await prisma.board.findUniqueOrThrow({
      where: { id: boardId, project: { workspaceId } },
    });

    return prisma.column.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
    });
  }

  /**
   * Create a new column at the end of a board.
   * Verifies workspace ownership before creating.
   */
  static async create(boardId: string, workspaceId: string, data: CreateColumnInput) {
    // Verify board belongs to this workspace
    await prisma.board.findUniqueOrThrow({
      where: { id: boardId, project: { workspaceId } },
    });

    let position = data.position;
    if (position === undefined) {
      const lastColumn = await prisma.column.findFirst({
        where: { boardId },
        orderBy: { position: "desc" },
      });
      position = lastColumn ? lastColumn.position + 1 : 0;
    }

    return prisma.column.create({
      data: { boardId, name: data.name, position },
    });
  }

  /**
   * Update a column's name and/or position.
   * Verifies workspace ownership before updating.
   */
  static async update(columnId: string, workspaceId: string, data: UpdateColumnInput) {
    // Verify column belongs to this workspace via board → project chain
    await prisma.column.findUniqueOrThrow({
      where: { id: columnId, board: { project: { workspaceId } } },
    });

    return prisma.column.update({
      where: { id: columnId },
      data,
    });
  }

  /**
   * Delete a column. All tasks inside it will Cascade.
   * Verifies workspace ownership before deleting.
   */
  static async delete(columnId: string, workspaceId: string) {
    // Verify column belongs to this workspace before deletion
    await prisma.column.findUniqueOrThrow({
      where: { id: columnId, board: { project: { workspaceId } } },
    });

    return prisma.column.delete({
      where: { id: columnId },
    });
  }
}

