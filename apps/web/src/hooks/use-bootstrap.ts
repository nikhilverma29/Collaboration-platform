import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore, applyTheme, applyAccent } from '@/stores/ui-store'
import api from '@/lib/api'
import type { AuthUser } from '@/types'

/**
 * useBootstrap
 *
 * Runs exactly once on app mount. Responsibilities:
 *
 * 1. Apply the persisted theme + accent to <html> BEFORE first render
 *    (prevents flash of wrong theme).
 *
 * 2. Verify the existing session by calling GET /api/users/me.
 *    - If 200: the HTTP-only cookie is valid — hydrate the user into the store.
 *    - If 401: the cookie is missing or expired — clear auth state.
 *    The Axios interceptor in lib/api.ts will attempt a silent refresh first;
 *    if that also fails, it redirects to /login, so we don't need to handle
 *    that case explicitly here.
 *
 * 3. Set isBootstrapping = false to unblock the router guards.
 *
 * This hook must be called from the top-level App component, before any
 * route rendering occurs.
 */
export function useBootstrap() {
  const { setUser, logout, setBootstrapping } = useAuthStore()
  const { theme, accentColor } = useUIStore()

  useEffect(() => {
    // Step 1 — Apply persisted visual preferences immediately
    applyTheme(theme)
    applyAccent(accentColor)

    // Step 2 — Verify session
    // ── Demo mode ─────────────────────────────────────────────────────────
    // If ?demo=1 is in the URL, skip the API call and use mock auth state.
    // This lets you see the full workspace shell without a live backend.
    // NEVER ships to production — it relies on the URL param being present.
    const isDemo = new URLSearchParams(window.location.search).get('demo') === '1'

    if (isDemo) {
      const { setUser, setTenant, setBootstrapping } = useAuthStore.getState()
      setUser({ id: 'demo-user', email: 'demo@syncra.app', displayName: 'Demo User', avatarUrl: null })
      setTenant({
        workspaceId: 'demo-ws',
        role: 'OWNER',
        workspace: {
          id: 'demo-ws',
          name: 'Syncra Demo',
          slug: 'syncra-demo',
          logoUrl: null,
          inviteCode: 'DEMO',
          ownerId: 'demo-user',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      })
      setBootstrapping(false)
      return
    }
    // ── End demo mode ──────────────────────────────────────────────────────

    async function checkSession() {
      try {
        const res = await api.get<{ success: true; data: AuthUser }>('/users/me')
        if (res.data.success) {
          setUser(res.data.data)
        }
      } catch (err: any) {
        // Only clear auth on 401 (cookie expired / invalid session).
        // On network errors (API down / no connection), keep existing state —
        // the user's session is likely still valid; we just can't verify it right now.
        if (err?.response?.status === 401) {
          logout()
        }
      } finally {
        // Step 3 — Unblock route guards regardless of outcome
        setBootstrapping(false)
      }
    }

    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount only
}
