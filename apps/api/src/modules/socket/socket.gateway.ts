import { Server, Socket } from "socket.io";
import { socketAuthMiddleware } from "./socket.middleware";
import { PresenceService } from "../presence/presence.service";
import { SocketService } from "./socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";
import { prisma } from "../../lib/db";

/**
 * Manages the WebSocket connection lifecycle and room partitioning.
 */
export class SocketGateway {
  constructor(private io: Server) {
    this.setupMiddleware();
    this.setupListeners();
  }

  private setupMiddleware() {
    this.io.use(socketAuthMiddleware);
  }

  private setupListeners() {
    this.io.on("connection", async (socket: Socket) => {
      // By the time we reach here, the middleware has verified the JWT
      // and attached the decoded payload to socket.data.user.
      const user = socket.data.user;
      const workspaceId: string = user.workspaceId;
      const userId: string = user.userId;
      
      // The tenant boundary: Sockets are strictly isolated to their workspace room.
      const workspaceRoom = `workspace:${workspaceId}`;

      // 1. Join Workspace Room and User Room
      socket.join(workspaceRoom);
      socket.join(`user:${userId}`);
      console.log(`[Socket.io] Client connected: User ${userId} -> Room ${workspaceRoom}`);

      // 2. Join Authorized Channel Rooms (ADR-004 privacy isolation)
      try {
        const accessibleChannels = await prisma.channel.findMany({
          where: {
            workspaceId,
            isArchived: false,
            OR: [
              { type: "PUBLIC" },
              { members: { some: { userId } } },
            ],
          },
          select: { id: true },
        });

        for (const ch of accessibleChannels) {
          socket.join(`channel:${ch.id}`);
        }
      } catch (err) {
        console.error(`[Socket.io] Failed to preload channel rooms for user ${userId}:`, err);
      }

      // 3. Dynamic Channel Join Listener
      socket.on("channel:join", (channelId: string) => {
        if (typeof channelId === "string" && channelId.trim()) {
          socket.join(`channel:${channelId.trim()}`);
        }
      });

      // 4. Mark user as online in presence store and compute updated status
      PresenceService.markOnline(workspaceId, userId);
      const presenceInfo = await PresenceService.computeStatus(workspaceId, userId);

      // 3. Broadcast updated presence to all workspace members
      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.PRESENCE_UPDATED, {
        actorId: userId,
        data: presenceInfo,
      });

      // 4. Disconnect Handler
      socket.on("disconnect", async () => {
        console.log(`[Socket.io] Client disconnected: User ${userId}`);
        PresenceService.markOffline(workspaceId, userId);

        const offlineInfo = await PresenceService.computeStatus(workspaceId, userId);
        SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.PRESENCE_UPDATED, {
          actorId: userId,
          data: offlineInfo,
        });
      });
    });
  }
}
