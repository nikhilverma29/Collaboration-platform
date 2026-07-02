import { prisma } from "../../lib/db";
import { MarkReadInput } from "@syncra/validators";

export class ReadReceiptService {

  /**
   * Mark a specific message as read for a user.
   * Ensures the message exists and belongs to a channel the user can access.
   */
  static async markAsRead(channelId: string, workspaceId: string, userId: string, data: MarkReadInput) {
    const { messageId } = data;

    // Verify message exists and belongs to the specified channel/workspace
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, channelId, workspaceId },
    });

    // Check if the user already has a read receipt for this exact message
    const existing = await prisma.readReceipt.findUnique({
      where: {
        userId_messageId: {
          userId,
          messageId,
        },
      },
    });

    if (existing) {
      return existing; // Idempotent
    }

    return prisma.readReceipt.create({
      data: {
        userId,
        messageId,
      },
    });
  }

  /**
   * Calculate the number of unread messages in a channel for a specific user.
   * This logic finds the user's latest ReadReceipt in the channel (by message.createdAt)
   * and counts how many messages were created after that point.
   */
  static async getUnreadCount(channelId: string, workspaceId: string, userId: string) {
    // 1. Find the latest read receipt for this user in this channel
    const latestReceipt = await prisma.readReceipt.findFirst({
      where: {
        userId,
        message: { channelId, workspaceId }, // Must join through message to filter by channel
      },
      include: {
        message: { select: { createdAt: true } },
      },
      orderBy: {
        message: { createdAt: "desc" },
      },
    });

    // 2. Count messages created after that receipt (or all if no receipt exists)
    const countQuery = {
      where: {
        channelId,
        workspaceId,
        parentId: null, // Usually unread counts only consider top-level messages
        ...(latestReceipt ? { createdAt: { gt: latestReceipt.message.createdAt } } : {}),
      },
    };

    return prisma.message.count(countQuery);
  }
}
