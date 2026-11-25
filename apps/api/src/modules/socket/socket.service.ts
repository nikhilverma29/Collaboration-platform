import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { SocketGateway } from "./socket.gateway";
import { SocketEvent, SocketEventEnvelope } from "@syncra/validators";

/**
 * Global singleton for managing the WebSocket instance.
 * Allows backend REST controllers to cleanly broadcast events 
 * without entangling HTTP logic with WebSocket internals.
 */
export class SocketService {
  private static io: Server | null = null;
  
  /**
   * Initializes the global Socket.io instance on top of the Express HTTP Server.
   */
  static init(server: HttpServer) {
    if (this.io) {
      console.warn("SocketService has already been initialized.");
      return;
    }

    // Default in-memory adapter is used for Phase 1-8 development.
    // CORS must be configured to allow credentials so HttpOnly cookies pass the handshake.
    const allowedOrigin = process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
    this.io = new Server(server, {
      cors: {
        origin: allowedOrigin.split(",").map((s) => s.trim().replace(/\/$/, "")),
        credentials: true,
      },
    });

    // Wire up the lifecycle and authentication guards
    new SocketGateway(this.io);
    
    console.log("[Socket.io] Service initialized and attached to HTTP server.");
  }

  /**
   * Centralized method for emitting domain events securely to a specific tenant workspace.
   */
  static broadcastToWorkspace<T>(
    workspaceId: string, 
    event: SocketEvent, 
    payload: { actorId?: string; data: T }
  ) {
    if (!this.io) {
      console.warn(`[Socket.io] Missed broadcast '${event}': Service not initialized.`);
      return;
    }

    const room = `workspace:${workspaceId}`;
    
    // Construct the standardized payload envelope
    const envelope: SocketEventEnvelope<T> = {
      meta: {
        workspaceId,
        actorId: payload.actorId,
        timestamp: new Date().toISOString(),
      },
      data: payload.data,
    };

    // Emit to everyone currently joined to this workspace room
    this.io.to(room).emit(event, envelope);
  }

  /**
   * Emits an event strictly to users who have joined a specific channel room.
   * Ensures private channels and direct message events are never leaked to the entire workspace (ADR-004).
   */
  static broadcastToChannel<T>(
    channelId: string,
    event: SocketEvent,
    payload: { actorId?: string; data: T; workspaceId: string }
  ) {
    if (!this.io) {
      console.warn(`[Socket.io] Missed channel broadcast '${event}': Service not initialized.`);
      return;
    }

    const room = `channel:${channelId}`;
    const envelope: SocketEventEnvelope<T> = {
      meta: {
        workspaceId: payload.workspaceId,
        actorId: payload.actorId,
        timestamp: new Date().toISOString(),
      },
      data: payload.data,
    };

    this.io.to(room).emit(event, envelope);
  }

  /**
   * Emit directly to a specific user across all their active sockets.
   */
  static sendToUser<T>(userId: string, event: SocketEvent, data: T) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }
}

