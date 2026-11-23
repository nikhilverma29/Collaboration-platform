import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser, TenantContext, WorkspaceMembership } from '@/types'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AuthState {
  // The authenticated user. null = logged out / unknown.
  user: AuthUser | null

  // The active workspace tenant context. null = authenticated but no workspace selected.
  // This is set ONLY after POST /api/workspaces/:id/switch resolves, which re-issues
  // the JWT with workspaceId + role. Until then, feature routes must not be accessible.
  tenant: TenantContext | null

  // All workspaces this user is a member of. Populated after login.
  memberships: WorkspaceMembership[]

  // True while the app is verifying the existing session on first load.
  isBootstrapping: boolean
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface AuthActions {
  /** Called after a successful login or register response. */
  setUser: (user: AuthUser) => void

  /**
   * Called after GET /api/workspaces resolves.
   * Stores the membership list so the workspace-select page can render it.
   */
  setMemberships: (memberships: WorkspaceMembership[]) => void

  /**
   * Called after POST /api/workspaces/:id/switch resolves.
   * Sets the active tenant context, unlocking all protected workspace routes
   * and allowing the socket to connect (it requires workspaceId in the JWT).
   */
  setTenant: (tenant: TenantContext) => void

  /**
   * Clears tenant context without logging out.
   * Used when the user wants to switch to a different workspace.
   */
  clearTenant: () => void

  /**
   * Full logout — clears user, tenant, memberships.
   * The caller must also POST /api/auth/logout to revoke the DB session.
   */
  logout: () => void

  /** Called once on app boot to signal session check is complete. */
  setBootstrapping: (value: boolean) => void
}

type AuthStore = AuthState & AuthActions

// ---------------------------------------------------------------------------
// Store
//
// We persist the `user` and `tenant` slices to sessionStorage (not localStorage)
// so the auth state survives page refreshes but NOT new browser sessions.
// This matches the HTTP-only cookie's lifetime — if the cookie is gone, the
// persisted state is stale and the 401 interceptor in api.ts will clear it.
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      tenant: null,
      memberships: [],
      isBootstrapping: true,

      // Actions
      setUser: (user) => set({ user }),

      setMemberships: (memberships) => set({ memberships }),

      setTenant: (tenant) => set({ tenant }),

      clearTenant: () => set({ tenant: null }),

      logout: () =>
        set({
          user: null,
          tenant: null,
          memberships: [],
        }),

      setBootstrapping: (value) => set({ isBootstrapping: value }),
    }),
    {
      name: 'syncra-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the fields that matter across page refreshes.
      // isBootstrapping should never be persisted — always recomputed on mount.
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        memberships: state.memberships,
      }),
    }
  )
)

// ---------------------------------------------------------------------------
// Selectors (use these instead of raw state slices to prevent re-render thrash)
// ---------------------------------------------------------------------------

/** True if the user has an active session (cookie exists, user loaded). */
export const selectIsAuthenticated = (s: AuthStore) => s.user !== null

/** True if the user has switched into a workspace (JWT has workspaceId + role). */
export const selectHasTenant = (s: AuthStore) => s.tenant !== null

/** The user's role in the active workspace. */
export const selectRole = (s: AuthStore) => s.tenant?.role ?? null
