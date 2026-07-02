# 04-realtime-infra — Realtime Infrastructure

## Purpose

Socket.io layer providing authenticated, workspace-scoped real-time connections. The HTTP handshake is intercepted to verify the same JWT as the REST API. Events are emitted only to workspace:${workspaceId} rooms via a centralized SocketService singleton.

## Dependencies

- `00-core-foundation`
- `01-auth-sessions`
- `02-workspace-tenancy`

## Main User Flow

Client connects → socketAuthMiddleware parses HttpOnly cookie → verifyAccessToken → reject if no workspaceId → socket.data.user set → gateway joins workspace room → SocketService.broadcastToWorkspace() sends events.

## Files Involved

- `apps/api/src/modules/socket/socket.service.ts`
- `apps/api/src/modules/socket/socket.gateway.ts`
- `apps/api/src/modules/socket/socket.middleware.ts`
- `packages/validators/src/socket.events.ts`
- `packages/validators/src/socket.types.ts`

## Source Code

### `apps/api/src/modules/socket/socket.service.ts`

```typescript
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
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:5173", // Example Vite default
        credentials: true, 
      }
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
}
```

### `apps/api/src/modules/socket/socket.gateway.ts`

```typescript
import { Server, Socket } from "socket.io";
import { socketAuthMiddleware } from "./socket.middleware";
import { PresenceService } from "../presence/presence.service";
import { SocketService } from "./socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

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

      // 1. Join Workspace Room
      socket.join(workspaceRoom);
      console.log(`[Socket.io] Client connected: User ${userId} -> Room ${workspaceRoom}`);

      // 2. Mark user as online in presence store and compute updated status
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
```

### `apps/api/src/modules/socket/socket.middleware.ts`

```typescript
import { Socket } from "socket.io";
import { verifyAccessToken } from "../../lib/jwt";

/**
 * Socket.io Middleware
 * Intercepts the WebSocket HTTP handshake, parses the HttpOnly cookies,
 * and securely verifies the JWT exactly as the REST API does.
 */
export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const cookieHeader = socket.request.headers.cookie;
    
    if (!cookieHeader) {
      return next(new Error("Unauthorized: No cookies provided in handshake"));
    }

    // Manually parse syncra_access to avoid ESM/CJS interop issues with the cookie package
    const match = cookieHeader.match(/syncra_access=([^;]+)/);
    const accessToken = match ? match[1] : null;

    if (!accessToken) {
      return next(new Error("Unauthorized: Missing access token"));
    }

    // Verify JWT natively
    const payload = verifyAccessToken(accessToken);
    
    // Validate tenant context (Phase 2.5 requirement - no global sockets allowed)
    if (!payload.workspaceId || !payload.role) {
      return next(new Error("Forbidden: Token lacks workspace context. Please switch to a workspace first."));
    }

    // Attach to socket data so the gateway has access to the user context
    socket.data.user = payload;
    
    next();
  } catch (error: any) {
    console.error("[Socket Auth Error]:", error.message);
    // If the token is expired or tampered with, block the connection
    next(new Error("Unauthorized: Invalid or expired token"));
  }
}
```

### `packages/validators/src/socket.events.ts`

```typescript
/**
 * Centralized registry of all WebSocket event names used across the platform.
 * Controllers and services must use these constants instead of hardcoding strings.
 */
export const SOCKET_EVENTS = {
  // Connection lifecycle
  ERROR: "error",

  // Workspaces (Phase 1/2)
  WORKSPACE_UPDATED: "workspace:updated",
  WORKSPACE_DELETED: "workspace:deleted",

  // Members (Phase 1/2)
  MEMBER_JOINED: "member:joined",
  MEMBER_LEFT: "member:left",
  MEMBER_ROLE_UPDATED: "member:role_updated",

  // Projects & Tasks (Phase 3)
  TASK_CREATED: "task:created",
  TASK_MOVED: "task:moved",
  TASK_UPDATED: "task:updated",
  TASK_DELETED: "task:deleted",

  // Documents (Phase 4)
  DOCUMENT_UPLOADED: "document:uploaded",
  DOCUMENT_UPDATED: "document:updated",
  DOCUMENT_DELETED: "document:deleted",

  // Chat (Phase 5)
  MESSAGE_SENT: "message:sent",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  THREAD_REPLIED: "thread:replied",

  // Presence (Phase 7)
  PRESENCE_UPDATED: "presence:updated",   // {userId, status, statusLabel}
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
```

### `packages/validators/src/socket.types.ts`

```typescript
/**
 * Standardized payload envelope for all WebSocket broadcasts.
 * Ensures every event on the bus carries consistent metadata.
 */
export interface SocketEventEnvelope<T = any> {
  meta: {
    /** The ID of the workspace this event is scoped to. */
    workspaceId: string;
    /** The ID of the user who triggered the event, if applicable. */
    actorId?: string;
    /** ISO string timestamp of when the event occurred. */
    timestamp: string;
  };
  /** The actual domain event data. */
  data: T;
}
```
