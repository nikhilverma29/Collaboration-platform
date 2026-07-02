import { prisma } from "../../lib/db";
import { CreateNotificationInput } from "@syncra/validators";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class NotificationService {
  /**
   * Internal method to create a notification and broadcast it via WebSockets.
   * Not exposed as a REST endpoint directly (notifications are system-generated).
   */
  static async create(workspaceId: string, data: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        workspaceId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        link: data.link,
      }
    });

    // Real-time toast
    SocketService.sendToUser(data.userId, SOCKET_EVENTS.NOTIFICATION_RECEIVED, notification);

    return notification;
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
