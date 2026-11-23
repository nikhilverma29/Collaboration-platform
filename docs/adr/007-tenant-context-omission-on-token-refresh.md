# ADR 007: Omission of Tenant Context on Token Refresh and Client-Side Resynchronization

* **Status:** Accepted (Documented Architectural Quirk)
* **Deciders:** Auth & Multi-Tenancy Architecture
* **Date:** 2026-06-29

---

## 1. Context & Problem Statement

Syncra enforces strict multi-tenancy. Every workspace-scoped request requires both an authenticated user and an active workspace context.

To minimize database round-trips on every API call, the active `workspaceId` and the user's workspace `role` (e.g., `OWNER`, `MEMBER`) are embedded directly inside the 15-minute JWT claims:
```ts
interface AccessTokenPayload {
  userId: string;
  workspaceId: string | null;
  role: WorkspaceRole | null;
  sessionId: string;
}
```
When an access token expires, the client calls `POST /api/auth/refresh` using their HTTP-only refresh token to acquire a fresh JWT.

---

## 2. Decision

When `POST /api/auth/refresh` is executed, the backend intentionally issues a **base JWT** with `workspaceId: null` and `role: null`:
```ts
// auth.controller.ts lines 126-133
const accessToken = signAccessToken({
  userId: user.id,
  workspaceId: null, // Initial session has no tenant context
  role: null,
  sessionId: session.sessionId,
});
```
* **Code Comment in `auth.controller.ts`:**
  > *"Note: To keep tenant context during refresh, this should ideally be recovered. But since refresh is global, they will re-select workspace, or we can decode the old access token if passed. For now, setting to null means they re-enter the workspace globally."*

---

## 3. The Problem & Consequences

### The 403 Forbidden Drop
Because the refreshed token has `workspaceId: null`:
1. If the client attempts to immediately retry a failed request (e.g., `GET /api/tasks?projectId=...`), the API middleware `requireWorkspace` checks `req.user.workspaceId` and immediately throws:
   ```json
   { "success": false, "error": "Active workspace context required. Please select or switch to a workspace." }
   ```
2. The user is effectively stripped of their workspace permissions every 15 minutes upon token refresh.

### Client-Side Mitigation (Axios Interceptor)
To prevent the user from being abruptly logged out or redirected to the workspace selector, the frontend Axios interceptor (`apps/web/src/lib/api.ts`) implements automatic workspace re-switching:
```ts
// api.ts lines 78-83
await api.post('/auth/refresh')
// Restore workspace-scoped JWT before retrying original request
await restoreWorkspaceContext()
return api(originalRequest)
```
Where `restoreWorkspaceContext()` reads the active `workspaceId` from the client's store and calls `POST /api/workspaces/:id/switch` to upgrade the base JWT to a workspace-scoped JWT before releasing queued requests.

---

## 4. Alternatives Considered

### Alternative A: Persisting `lastWorkspaceId` on the Refresh Token Session
* **How it works:** When a user switches workspaces (`POST /workspaces/:id/switch`), update the `refresh_tokens` table with `activeWorkspaceId = id`.
* **Why it was considered:** When `/auth/refresh` is called, the backend reads the associated session row, checks that the user is still an active member of that workspace, and issues the new JWT pre-populated with `workspaceId` and `role`.
* **Why it was deferred:** Requires an extra write to `refresh_tokens` on every workspace switch.

### Alternative B: Client Passes Desired Workspace ID in Refresh Header
* **How it works:** `POST /api/auth/refresh` accepts an optional header `x-workspace-id: ws_123` or query parameter.
* **Why it was considered:** Allows stateless refresh while maintaining tenant context.

---

## 5. Production Remediation Plan

The client-side two-step refresh (`/auth/refresh` followed by `/workspaces/:id/switch`) introduces an unnecessary network round-trip and can create race conditions if network connectivity drops between the two calls.

**Target Architecture:**
1. Update `POST /api/auth/refresh` to accept optional `workspaceId` in the request body or read `syncra_workspace` cookie.
2. In `AuthService.refreshSession()`, if `workspaceId` is present, verify membership and role in the database and sign the new JWT with full workspace claims in a **single atomic response**.

