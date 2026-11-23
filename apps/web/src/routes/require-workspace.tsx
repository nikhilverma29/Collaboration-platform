import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

/**
 * RequireWorkspace
 *
 * Second-layer guard. Only allows access when the user has an active
 * workspace tenant context (workspaceId + role are present in the store).
 *
 * This context is set exclusively by the workspace switch flow:
 *   POST /api/workspaces/:id/switch → new JWT issued → store.setTenant()
 *
 * Without it, the backend will return 403 on every feature route
 * (requireWorkspace middleware), and the socket will refuse to connect
 * (socketAuthMiddleware checks payload.workspaceId).
 *
 * Must be nested INSIDE RequireAuth — assumes user is already verified.
 *
 * Usage in router:
 *   <Route element={<RequireAuth />}>
 *     <Route path="workspace-select" element={<WorkspaceSelectPage />} />
 *     <Route element={<RequireWorkspace />}>
 *       <Route path="workspace/*" element={<WorkspaceLayout />} />
 *     </Route>
 *   </Route>
 */
export function RequireWorkspace() {
  const tenant = useAuthStore((s) => s.tenant)

  // Authenticated but no workspace selected — redirect to the selection screen
  if (!tenant) {
    return <Navigate to="/workspace-select" replace />
  }

  return <Outlet />
}
