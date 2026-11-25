import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  CheckSquare,
  MessageSquare,
  FileText,
  Calendar,
  Sparkles,
  Check,
  Plus,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import type { WorkspaceMembership } from '@/types'

// ---------------------------------------------------------------------------
// Rail navigation items & area detection
// ---------------------------------------------------------------------------

export type RailArea = 'home' | 'tasks' | 'chat' | 'docs' | 'calendar' | 'ai'

interface MainRailItem {
  id: RailArea
  icon: React.ElementType
  label: string
  to: string
}

/**
 * MAIN_ITEMS: The major Syncra product areas.
 * These answer: "Which major area of Syncra am I using?"
 *
 * This list intentionally does NOT include account controls such as
 * Settings or Profile — those are not product areas.
 */
const MAIN_ITEMS: readonly MainRailItem[] = [
  { id: 'home',     icon: Home,          label: 'Home',     to: '/workspace/dashboard' },
  { id: 'tasks',    icon: CheckSquare,   label: 'Tasks',    to: '/workspace/tasks' },
  { id: 'chat',     icon: MessageSquare, label: 'Chat',     to: '/workspace/chat' },
  { id: 'docs',     icon: FileText,      label: 'Docs',     to: '/workspace/docs' },
  { id: 'calendar', icon: Calendar,      label: 'Calendar', to: '/workspace/calendar' },
  { id: 'ai',       icon: Sparkles,      label: 'AI',       to: '/workspace/ai' },
] as const

/**
 * Maps the current pathname to one of the six rail areas.
 * Returns null if the current path is outside product areas (e.g., settings).
 */
export function getRailArea(pathname: string): RailArea | null {
  if (pathname.startsWith('/workspace/tasks'))    return 'tasks'
  if (pathname.startsWith('/workspace/chat'))     return 'chat'
  if (pathname.startsWith('/workspace/docs'))     return 'docs'
  if (pathname.startsWith('/workspace/calendar')) return 'calendar'
  if (pathname.startsWith('/workspace/ai'))       return 'ai'
  if (pathname.startsWith('/workspace/dashboard') || pathname === '/workspace' || pathname === '/workspace/') return 'home'
  return null
}

// ---------------------------------------------------------------------------
// RailItem
// ---------------------------------------------------------------------------

interface RailItemProps {
  icon: React.ElementType
  label: string
  to: string
  badgeCount?: number
  hasDot?: boolean
  isActive?: boolean
}

function RailItem({ icon: Icon, label, to, badgeCount, hasDot, isActive }: RailItemProps) {
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0
  const showDot = Boolean(hasDot && !showBadge)

  return (
    <NavLink
      to={to}
      title={showBadge ? `${label} (${badgeCount} unread)` : label}
      className={({ isActive: navActive }) => {
        const active = isActive !== undefined ? isActive : navActive
        return `rail-item${active ? ' active' : ''}${showBadge || showDot ? ' has-badge' : ''}`
      }}
    >
      <span className="rail-item-icon">
        <Icon size={18} strokeWidth={1.75} />
        {showBadge && (
          <span className="rail-item-badge" aria-label={`${badgeCount} unread`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {showDot && (
          <span className="rail-item-dot" aria-label="Notification indicator" />
        )}
      </span>
      <span className="rail-item-label">{label}</span>
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSwitcher
// ---------------------------------------------------------------------------

function getWorkspaceHue(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
}

function formatRole(role?: string): string {
  switch (role) {
    case 'OWNER': return 'Owner'
    case 'ADMIN': return 'Admin'
    case 'MANAGER': return 'Manager'
    case 'EMPLOYEE': return 'Member'
    default: return role ?? 'Member'
  }
}

function WorkspaceSwitcher() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const memberships = useAuthStore((s) => s.memberships)
  const setMemberships = useAuthStore((s) => s.setMemberships)
  const setTenant = useAuthStore((s) => s.setTenant)
  const clearTenant = useAuthStore((s) => s.clearTenant)
  const logout = useAuthStore((s) => s.logout)

  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const activeWorkspace = tenant?.workspace
  const activeWsName = activeWorkspace?.name ?? 'Syncra'
  const activeRole = tenant?.role
  const workspaceInitial = activeWsName[0]?.toUpperCase() ?? 'S'

  // Fetch memberships if not populated yet
  useEffect(() => {
    if (open && memberships.length === 0) {
      api.get('/workspaces')
        .then((res) => {
          if (res.data?.data) {
            setMemberships(res.data.data)
          }
        })
        .catch(() => {})
    }
  }, [open, memberships.length, setMemberships])

  // Click-outside and Escape key listener
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSwitch = async (membership: WorkspaceMembership) => {
    if (membership.workspace.id === tenant?.workspaceId) return
    setSwitching(membership.workspace.id)
    try {
      await api.post(`/workspaces/${membership.workspace.id}/switch`)
      setTenant({
        workspaceId: membership.workspace.id,
        role: membership.role,
        workspace: membership.workspace,
      })
      setOpen(false)
      navigate('/workspace/dashboard', { replace: true })
    } catch {
      // silently fail — user stays on current workspace
    } finally {
      setSwitching(null)
    }
  }

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    clearTenant()
    logout()
    navigate('/login', { replace: true })
  }

  const otherMemberships = memberships.filter(
    (m) => m.workspace.id !== tenant?.workspaceId
  )

  return (
    <div className="ws-switcher-wrap" ref={wrapRef}>
      {/* Logo mark trigger */}
      <div
        className="rail-logo"
        onClick={() => setOpen((v) => !v)}
        title={activeWsName + (user?.displayName ? ` (${user.displayName})` : '')}
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        {workspaceInitial}
      </div>

      {open && (
        <div className="ws-switcher-dropdown" role="menu">
          {/* Active workspace row */}
          <div className="ws-switcher-section">
            <div className="ws-switcher-row active" role="menuitem">
              <span
                className="ws-switcher-avatar"
                style={{ background: `oklch(0.58 0.15 ${getWorkspaceHue(activeWsName)})` }}
              >
                {workspaceInitial}
              </span>
              <span className="ws-switcher-name" title={activeWsName}>
                {activeWsName}
              </span>
              <span className="ws-switcher-role">
                {formatRole(activeRole)}
              </span>
              <Check size={12} strokeWidth={2.5} style={{ color: 'var(--success)', flexShrink: 0 }} />
            </div>
          </div>

          {/* Other workspaces */}
          {otherMemberships.length > 0 && (
            <div className="ws-switcher-section">
              {otherMemberships.map((m) => {
                const isSwitching = switching === m.workspace.id
                return (
                  <button
                    key={m.workspace.id}
                    type="button"
                    className="ws-switcher-row"
                    onClick={() => handleSwitch(m)}
                    disabled={switching !== null}
                    role="menuitem"
                  >
                    {isSwitching ? (
                      <span className="ws-switcher-avatar" style={{ background: 'var(--surface-active)' }}>
                        <Loader2
                          size={12}
                          strokeWidth={2.5}
                          style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent-brand)' }}
                        />
                      </span>
                    ) : (
                      <span
                        className="ws-switcher-avatar"
                        style={{ background: `oklch(0.58 0.15 ${getWorkspaceHue(m.workspace.name)})` }}
                      >
                        {m.workspace.name[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                    <span className="ws-switcher-name" title={m.workspace.name}>
                      {m.workspace.name}
                    </span>
                    <span className="ws-switcher-role">
                      {formatRole(m.role)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Actions */}
          <div className="ws-switcher-section">
            <button
              type="button"
              className="ws-switcher-row"
              onClick={() => {
                setOpen(false)
                navigate('/select-workspace')
              }}
              role="menuitem"
            >
              <Plus size={14} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
              <span className="ws-switcher-name">Create workspace</span>
            </button>
            <button
              type="button"
              className="ws-switcher-row"
              onClick={() => {
                setOpen(false)
                navigate('/workspace/settings')
              }}
              role="menuitem"
            >
              <Settings size={14} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
              <span className="ws-switcher-name">Workspace settings</span>
            </button>
          </div>

          {/* Logout */}
          <div className="ws-switcher-section">
            <button
              type="button"
              className="ws-switcher-row danger"
              onClick={handleLogout}
              role="menuitem"
            >
              <LogOut size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="ws-switcher-name">Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

/**
 * Rail — The fixed left navigation strip.
 *
 * Responsibility: "Which major area of Syncra am I using?"
 *
 * Contains:
 * - Workspace logo mark at top (workspace initial — acts as a home anchor)
 * - Major product area nav items (Home, Tasks, Chat, Docs, Calendar, AI)
 * - [divider]
 * - Profile button (single canonical account control access point)
 *
 * The Rail does NOT contain:
 * - A separate Settings gear (Settings is accessed via Profile)
 * - Workspace-specific entities or deep contextual navigation
 * - Anything that belongs to the Secondary Sidebar or Topbar
 */
export function Rail() {
  const location = useLocation()
  const tenant = useAuthStore((s) => s.tenant)
  const workspaceId = tenant?.workspaceId

  const lastVisitedRoutes = useUIStore((s) => s.lastVisitedRoutes)
  const setLastVisitedRoute = useUIStore((s) => s.setLastVisitedRoute)
  const clearLastVisitedRoutes = useUIStore((s) => s.clearLastVisitedRoutes)

  // Reset per-area navigation history when switching workspaces
  const prevWorkspaceIdRef = useRef<string | undefined>(workspaceId)
  useEffect(() => {
    if (prevWorkspaceIdRef.current && prevWorkspaceIdRef.current !== workspaceId) {
      clearLastVisitedRoutes()
    }
    prevWorkspaceIdRef.current = workspaceId
  }, [workspaceId, clearLastVisitedRoutes])

  // Track last-visited full route (pathname + query) for current rail area
  useEffect(() => {
    const area = getRailArea(location.pathname)
    if (area) {
      let search = location.search
      if (search && search.includes('action=')) {
        const sp = new URLSearchParams(search)
        sp.delete('action')
        const str = sp.toString()
        search = str ? `?${str}` : ''
      }
      const fullPath =
        location.pathname === '/workspace' || location.pathname === '/workspace/'
          ? '/workspace/dashboard'
          : location.pathname + search

      const currentSaved = useUIStore.getState().lastVisitedRoutes[area]
      if (currentSaved !== fullPath) {
        setLastVisitedRoute(area, fullPath)
      }
    }
  }, [location.pathname, location.search, setLastVisitedRoute])

  const currentArea = getRailArea(location.pathname)

  // Calculate total unread messages from channels and unreadCounts dictionary
  const chatUnread = useChatStore((s) => {
    let count = 0
    const countedIds = new Set<string>()

    for (const [chId, unread] of Object.entries(s.unreadCounts)) {
      count += (unread || 0)
      countedIds.add(chId)
    }

    for (const ch of s.channels) {
      if (!countedIds.has(ch.id)) {
        count += (ch as any).unreadCount || 0
      }
    }

    return count
  })

  // Ensure real-time socket connection is initialized so incoming messages bump unread count
  const connectRealtime = useChatStore((s) => s.connectRealtime)
  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const channels = useChatStore((s) => s.channels)

  useEffect(() => {
    if (workspaceId) {
      if (channels.length === 0) {
        fetchChannels()
      }
      connectRealtime()
    }
  }, [workspaceId, channels.length, fetchChannels, connectRealtime])

  // Tasks due / overdue indicator if tracked in task-store
  const hasDueTasks = useTaskStore((s) => {
    const now = new Date()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    for (const colTasks of Object.values(s.tasksByColumn)) {
      for (const t of colTasks) {
        if (t.dueDate && t.status !== 'DONE') {
          const d = new Date(t.dueDate)
          if (d <= todayEnd) return true
        }
      }
    }
    return false
  })

  return (
    <aside className="rail" aria-label="Primary navigation">
      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Major product areas */}
      <nav className="rail-nav" aria-label="Main">
        {MAIN_ITEMS.map((item) => {
          let badgeCount: number | undefined
          let hasDot = false

          if (item.id === 'chat') {
            badgeCount = chatUnread
          } else if (item.id === 'tasks') {
            hasDot = hasDueTasks
          }

          const targetRoute = lastVisitedRoutes[item.id] || item.to
          const isItemActive = currentArea === item.id

          return (
            <RailItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              to={targetRoute}
              badgeCount={badgeCount}
              hasDot={hasDot}
              isActive={isItemActive}
            />
          )
        })}
      </nav>
    </aside>
  )
}
