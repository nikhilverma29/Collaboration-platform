import axios from 'axios'
import { API_URL } from './constants'

/**
 * Axios instance pre-configured for the Syncra API.
 * - Sends cookies automatically (withCredentials: true)
 * - Intercepts 401s and attempts token refresh
 * - Intercepts 403 "workspace context" errors and re-switches automatically
 */
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Track if we're currently refreshing to prevent refresh loops
let isRefreshing = false
let refreshSubscribers: Array<(token: boolean) => void> = []

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach(cb => cb(success))
  refreshSubscribers = []
}

// Auth endpoints that should never trigger a token refresh attempt
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']
// Workspace switch should not trigger its own re-switch loop
const NO_SWITCH_PATHS  = [...NO_REFRESH_PATHS, '/workspaces']

/**
 * After a successful token refresh, the server issues a BASE token (no workspaceId).
 * If the user had an active workspace, we must re-call POST /workspaces/:id/switch
 * to get a workspace-scoped JWT before retrying the original request.
 */
async function restoreWorkspaceContext(): Promise<void> {
  const { useAuthStore } = await import('@/stores/auth-store')
  const { tenant, setTenant } = useAuthStore.getState()
  if (!tenant?.workspaceId) return
  try {
    await api.post(`/workspaces/${tenant.workspaceId}/switch`)
    // Tenant context is unchanged — just refreshed the workspace-scoped JWT cookie
    setTenant({ ...tenant })
  } catch {
    // If the workspace switch fails, clear tenant — user needs to re-select
    const { clearTenant } = useAuthStore.getState()
    clearTenant()
  }
}

// Response interceptor — handles 401 (expired) and 403 (missing workspace context)
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config
    const status = error.response?.status
    const errorMsg: string = error.response?.data?.error ?? ''

    // Skip refresh entirely for auth endpoints
    const isAuthEndpoint = NO_REFRESH_PATHS.some(p => originalRequest.url?.includes(p))

    // ── 401: token expired — attempt silent refresh then restore workspace ──
    if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push(success => {
            if (success) resolve(api(originalRequest))
            else reject(error)
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        await api.post('/auth/refresh')
        // Restore workspace-scoped JWT if needed
        await restoreWorkspaceContext()
        isRefreshing = false
        onRefreshed(true)
        return api(originalRequest)
      } catch {
        isRefreshing = false
        onRefreshed(false)
        const { useAuthStore } = await import('@/stores/auth-store')
        useAuthStore.getState().logout()
        return Promise.reject(error)
      }
    }

    // ── 403 "Active workspace context required" — re-switch workspace ──
    // This happens when the access token is a base token (no workspaceId).
    // We re-switch the workspace to get a workspace-scoped token and retry once.
    const isMissingContext = status === 403 && errorMsg.toLowerCase().includes('workspace context')
    const isSwitchPath = NO_SWITCH_PATHS.some(p => originalRequest.url?.includes(p))

    if (isMissingContext && !originalRequest._wsRetry && !isSwitchPath) {
      originalRequest._wsRetry = true
      await restoreWorkspaceContext()
      return api(originalRequest)
    }

    return Promise.reject(error)
  }
)

export default api
