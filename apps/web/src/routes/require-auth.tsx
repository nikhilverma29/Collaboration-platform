import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

/**
 * RequireAuth
 *
 * Route guard for routes that need an authenticated user (valid session cookie).
 * This does NOT require workspace context — it only checks that login occurred.
 *
 * If the user is still bootstrapping (session check in progress), renders nothing
 * to prevent a flash redirect to /login before the check completes.
 *
 * Usage in router:
 *   <Route element={<RequireAuth />}>
 *     <Route path="workspace-select" element={<WorkspaceSelectPage />} />
 *     <Route element={<RequireWorkspace />}>
 *       ...workspace-scoped routes
 *     </Route>
 *   </Route>
 */
export function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const location = useLocation()

  // Still verifying the session — render nothing to avoid flicker
  if (isBootstrapping) {
    return null
  }

  // Not authenticated — redirect to login, preserving the attempted URL
  // so we can redirect back after successful login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
