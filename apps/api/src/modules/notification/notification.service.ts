import { prisma } from "../../lib/db";
import { CreateNotificationInput } from "@syncra/validators";

export class NotificationService {
  /**
   * Creates a notification record in the database.
   * Does NOT emit a socket event — the caller (controller or event handler)
   * is responsible for real-time delivery after calling this method.
   */
  static async create(workspaceId: string, data: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        workspaceId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link,
      }
    });
  }

  static async list(workspaceId: string, userId: string) {
    return await prisma.notification.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  static async markAsRead(workspaceId: string, userId: string, notificationId: string) {
    const notification = await prisma.notification.update({
      where: { id: notificationId, workspaceId, userId },
      data: { isRead: true }
    });
    return notification;
  }

  static async markAllAsRead(workspaceId: string, userId: string) {
    await prisma.notification.updateMany({
      where: { workspaceId, userId, isRead: false },
      data: { isRead: true }
    });
  }

  static async delete(workspaceId: string, userId: string, notificationId: string) {
    await prisma.notification.delete({
      where: { id: notificationId, workspaceId, userId }
    });
  }
}

