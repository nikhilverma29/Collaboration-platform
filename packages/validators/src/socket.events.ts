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
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",

  // Presence (Phase 7)
  PRESENCE_UPDATED: "presence:updated",   // {userId, status, statusLabel}

  // Notifications (Phase Gaps)
  NOTIFICATION_RECEIVED: "notification:received",
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
