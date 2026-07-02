import { prisma } from "../../lib/db";
import { CreateColumnInput, UpdateColumnInput } from "@syncra/validators";

export class ColumnService {
  /**
   * List all columns in a board, ordered by position.
   */
  static async listByBoard(boardId: string) {
    return prisma.column.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
    });
  }

  /**
   * Create a new column at the end of a board.
   * If no position is specified, it appends after the last column.
   */
  static async create(boardId: string, data: CreateColumnInput) {
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
   */
  static async update(columnId: string, data: UpdateColumnInput) {
    return prisma.column.update({
      where: { id: columnId },
      data,
    });
  }

  /**
   * Delete a column. All tasks inside it must be moved first or will Cascade.
   */
  static async delete(columnId: string) {
    return prisma.column.delete({
      where: { id: columnId },
    });
  }
}
