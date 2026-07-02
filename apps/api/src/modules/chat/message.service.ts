import { prisma } from "../../lib/db";
import { SendMessageInput, EditMessageInput, ListMessagesQuery } from "@syncra/validators";

// Shared include shape used on every message query for consistency
const messageInclude = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
  editedBy: { select: { id: true, displayName: true } },
  reactions: {
    include: { user: { select: { id: true, displayName: true } } },
  },
  file: true,
  _count: { select: { replies: true } },
} as const;

export class MessageService {

  /**
   * List messages for a channel with cursor-based pagination (oldest → newest).
   * Returns up to `limit` messages that were created before the `before` cursor.
   */
  static async list(workspaceId: string, query: ListMessagesQuery) {
    const { channelId, limit, before } = query;

    // Verify channel belongs to workspace
    await prisma.channel.findUniqueOrThrow({ where: { id: channelId, workspaceId } });

    const cursorClause = before
      ? { createdAt: { lt: (await prisma.message.findUniqueOrThrow({ where: { id: before } })).createdAt } }
      : {};

    // Only fetch top-level messages (not thread replies)
    const messages = await prisma.message.findMany({
      where: {
        channelId,
        workspaceId,
        parentId: null,
        ...cursorClause,
      },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Return in chronological order (oldest first)
    return messages.reverse();
  }

  /**
   * Send a new message into a channel (or thread reply if parentId is set).
   */
  static async send(workspaceId: string, actorId: string, data: SendMessageInput) {
    // If this is a thread reply, validate the parent message exists in the same channel
    if (data.parentId) {
      await prisma.message.findUniqueOrThrow({
        where: { id: data.parentId, channelId: data.channelId },
      });
    }

    // If a fileId is attached, validate the file belongs to the same workspace
    if (data.fileId) {
      await prisma.file.findUniqueOrThrow({ where: { id: data.fileId, workspaceId } });
    }

    const message = await prisma.message.create({
      data: {
        workspaceId,
        channelId: data.channelId,
        authorId: actorId,
        content: data.content,
        parentId: data.parentId || null,
        fileId: data.fileId || null,
      },
      include: messageInclude,
    });

    // Extract mentions: e.g. @Alice
    const mentions = data.content.match(/@(\w+)/g);
    if (mentions) {
      const displayNames = mentions.map(m => m.substring(1));
      
      const mentionedUsers = await prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          user: { displayName: { in: displayNames } }
        },
        include: { user: true }
      });

      // Avoid notifying the author if they mention themselves
      const usersToNotify = mentionedUsers.filter(m => m.userId !== actorId);

      // We can't safely import NotificationService directly due to circular dependency risk, 
      // but they are loosely coupled. Let's just create them via prisma and emit.
      for (const m of usersToNotify) {
        await prisma.notification.create({
          data: {
            workspaceId,
            userId: m.userId,
            type: "MENTION",
            title: "New Mention",
            body: `${message.author.displayName} mentioned you in a message.`,
            link: `/workspaces/${workspaceId}/chat/${data.channelId}`,
          }
        });
        
        // Dynamic import to avoid circular dependency
        const { SocketService: Socket } = require("../socket/socket.service");
        Socket.sendToUser(m.userId, "notification:received" as any, {
          title: "New Mention",
          body: `${message.author.displayName} mentioned you in a message.`
        });
      }
    }

    return message;
  }

  /**
   * Edit an existing message. Only the original author may edit.
   */
  static async edit(messageId: string, workspaceId: string, actorId: string, data: EditMessageInput) {
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    if (message.authorId !== actorId) {
      throw new Error("Only the author can edit this message");
    }

    if (message.isDeleted) {
      throw new Error("Cannot edit a deleted message");
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        content: data.content,
        isEdited: true,
        editedById: actorId,
      },
      include: messageInclude,
    });
  }

  /**
   * Soft-delete a message. Content is replaced with a tombstone marker.
   * Thread structure is preserved — replies remain visible.
   * Admins can delete any message; regular users can only delete their own.
   */
  static async delete(messageId: string, workspaceId: string, actorId: string, isAdmin: boolean) {
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    if (!isAdmin && message.authorId !== actorId) {
      throw new Error("You can only delete your own messages");
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: "[This message was deleted]",
      },
    });
  }

  /**
   * Get a single message by ID (used for real-time verification).
   */
  static async getById(messageId: string, workspaceId: string) {
    return prisma.message.findFirst({
      where: { id: messageId, workspaceId },
      include: messageInclude,
    });
  }

  // ---------------------------------------------------------------------------
  // Layer 4 — Threads & Reactions
  // ---------------------------------------------------------------------------

  /**
   * List all replies to a specific message.
   */
  static async listReplies(messageId: string, workspaceId: string) {
    // Validate parent message exists
    await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    return prisma.message.findMany({
      where: { parentId: messageId, workspaceId },
      include: messageInclude,
      orderBy: { createdAt: "asc" }, // Threads are usually oldest-to-newest
    });
  }

  /**
   * Add or remove a reaction. If the user already reacted with this emoji, it removes it (toggle).
   */
  static async toggleReaction(messageId: string, workspaceId: string, actorId: string, emoji: string) {
    // Validate message exists
    await prisma.message.findUniqueOrThrow({
      where: { id: messageId, workspaceId },
    });

    // Check if reaction exists
    const existing = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: actorId,
          emoji,
        },
      },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { action: "removed", emoji };
    } else {
      await prisma.reaction.create({
        data: { messageId, userId: actorId, emoji },
      });
      return { action: "added", emoji };
    }
  }
}
