# ADR 004: Workspace-Scoped Socket Rooms and Direct Message Privacy Trade-offs

* **Status:** Accepted (with Identified Technical Debt / Migration Plan)
* **Deciders:** Real-time & Chat Engineering
* **Date:** 2026-07-02

---

## 1. Context & Problem Statement

Syncra utilizes Socket.io to deliver real-time updates for:
1. Workspace-wide mutations (task creation/movement, member joins, org chart changes).
2. Chat communication (new messages, typing indicators, read receipts, reactions).
3. Online presence (status updates).

To prevent cross-tenant data leakage, WebSocket connections must be partitioned so that users only receive events belonging to their active workspace.

---

## 2. Decision

In Phase 2.5–5, client sockets are partitioned strictly at the **workspace boundary**:
* On connection, every authenticated socket joins:
  1. `workspace:${workspaceId}`
  2. `user:${userId}`
* Domain mutations call:
  ```ts
  SocketService.broadcastToWorkspace(workspaceId, eventName, payload);
  ```

```ts
// socket.gateway.ts
const workspaceRoom = `workspace:${workspaceId}`;
socket.join(workspaceRoom);
socket.join(`user:${userId}`);
```

---

## 3. Alternatives Considered

### Alternative A: Fine-Grained Channel & Project Rooms (`channel:${channelId}`, `project:${projectId}`)
* **How it works:** Sockets join specific rooms matching only the channels and projects the user has permission to view. When a message is sent, it is broadcast only to `channel:${channelId}`.
* **Why it was deferred in Phase 5:**
  * Added connection lifecycle complexity: when a user switches channels, is added to a private channel, or creates a new project, the server must emit dynamic room join/leave instructions to the client socket.
  * For public channels, any workspace member is a member anyway, so broadcasting to the workspace was the simplest functional path.

---

## 4. Consequences & Identified Flaws (`@BlindSpot`)

### Positive
* **Simple Room Topology:** Sockets join their rooms once upon connection. No dynamic room joining/leaving logic is required when users browse between channels or boards.
* **Guaranteed Multi-Tenant Isolation:** Users in Workspace A never receive events from Workspace B under any circumstances.

### Critical Security & Privacy Gap (The DM Leak)
* **The Vulnerability:**
  Because `MessageController.send` emits `SOCKET_EVENTS.MESSAGE_SENT` to `workspace:${workspaceId}`, **all connected users in the workspace receive every message event**, including:
  1. Confidential 1-on-1 Direct Messages (DMs).
  2. Private/Secret Channels intended only for select managers or owners.
* Any workspace member can open their browser DevTools Network tab, inspect the incoming WebSocket frame, and read confidential DM contents in real time as they are transmitted across the workspace room.

---

## 5. Production Remediation Plan

To resolve this privacy gap, the following migration is required:

1. **Dynamic Channel Subscriptions:**
   When a user opens the chat application, the backend queries all channels the user belongs to and joins their socket to `channel:${channelId}` rooms.
2. **Targeted Emission:**
   * Public workspace events (tasks, projects) continue emitting to `workspace:${workspaceId}`.
   * Channel messages emit **strictly** to `channel:${channelId}`:
     ```ts
     this.io.to(`channel:${channelId}`).emit(SOCKET_EVENTS.MESSAGE_SENT, envelope);
     ```
   * Notifications and unread badge counters emit to target user rooms (`user:${recipientUserId}`).

