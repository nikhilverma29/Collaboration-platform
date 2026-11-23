/**
 * Centralized registry of all WebSocket event names used across the platform.
 * Controllers and services must use these constants instead of hardcoding strings.
 * The frontend subscribes to these exact event names — never use WORKSPACE_UPDATED
 * as a catch-all. Use the correct domain-specific event.
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

  // Projects (Phase 3)
  PROJECT_CREATED: "project:created",
  PROJECT_UPDATED: "project:updated",
  PROJECT_ARCHIVED: "project:archived",
  PROJECT_DELETED: "project:deleted",
  PROJECT_MEMBER_ADDED: "project:member_added",
  PROJECT_MEMBER_REMOVED: "project:member_removed",

  // Columns / Boards (Phase 3)
  COLUMN_CREATED: "column:created",
  COLUMN_UPDATED: "column:updated",
  COLUMN_DELETED: "column:deleted",

  // Tasks (Phase 3)
  TASK_CREATED: "task:created",
  TASK_MOVED: "task:moved",
  TASK_UPDATED: "task:updated",
  TASK_DELETED: "task:deleted",

  // Files & Storage (Phase 4)
  FILE_UPLOADED: "file:uploaded",
  FILE_RENAMED: "file:renamed",
  FILE_MOVED: "file:moved",
  FILE_DELETED: "file:deleted",

  // Folders (Phase 4)
  FOLDER_CREATED: "folder:created",
  FOLDER_RENAMED: "folder:renamed",
  FOLDER_MOVED: "folder:moved",
  FOLDER_DELETED: "folder:deleted",

  // Documents (Phase 4)
  DOCUMENT_UPLOADED: "document:uploaded",
  DOCUMENT_UPDATED: "document:updated",
  DOCUMENT_DELETED: "document:deleted",

  // Chat / Channels (Phase 5)
  CHANNEL_CREATED: "channel:created",
  CHANNEL_UPDATED: "channel:updated",
  CHANNEL_ARCHIVED: "channel:archived",
  CHANNEL_DELETED: "channel:deleted",

  // Messages (Phase 5)
  MESSAGE_SENT: "message:sent",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  THREAD_REPLIED: "thread:replied",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",

  // Org Chart (Phase 6)
  ORG_CHART_UPDATED: "org:chart_updated",

  // Calendar (Phase 6)
  MEETING_CREATED: "calendar:meeting_created",
  MEETING_CANCELLED: "calendar:meeting_cancelled",
  LEAVE_REQUESTED: "calendar:leave_requested",
  LEAVE_REVIEWED: "calendar:leave_reviewed",

  // Presence (Phase 7)
  PRESENCE_UPDATED: "presence:updated",   // {userId, status, statusLabel}

  // Notifications
  NOTIFICATION_RECEIVED: "notification:received",
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

