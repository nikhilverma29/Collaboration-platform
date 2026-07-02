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
