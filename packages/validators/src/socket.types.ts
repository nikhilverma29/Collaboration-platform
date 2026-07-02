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
