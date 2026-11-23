import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  CheckSquare,
  UserCheck,
  CalendarClock,
  Hash,
  FileText,
  Sparkles,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Search,
  Lock,
  X,
  Clock,
  Star,
  Folder,
  Trash2,
  LayoutDashboard,
  Activity,
  CalendarDays,
  Users,
  Plane,
  ListChecks,
  FileEdit,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { useTaskStore } from '@/stores/task-store'
import { useAuthStore } from '@/stores/auth-store'

// ---------------------------------------------------------------------------
// Exported types (preserved for external compatibility)
// ---------------------------------------------------------------------------

export interface SidebarItem {
  id: string
  label: string
  to: string
  icon?: React.ElementType
  onClick?: () => void
  /** Unread count — shows a badge. 0 or undefined = no badge. */
  unread?: number
  /** Short secondary badge label — mutually exclusive with unread */
  badge?: string
}

export interface SidebarSection {
  id: string
  label: string
  icon: React.ElementType
  items: SidebarItem[]
  to?: string
  addLabel?: string
  onAdd?: () => void
  emptyLabel?: string
  loading?: boolean
  error?: string
  onRetry?: () => void
  itemLimit?: number
}

// ---------------------------------------------------------------------------
// Derive active area from pathname
// ---------------------------------------------------------------------------

/**
 * Maps the current pathname to one of the six rail areas.
 * This mirrors exactly how NavLink.isActive works in rail.tsx —
 * both are route-driven, no new state needed.
 */
type SidebarMode = 'home' | 'tasks' | 'chat' | 'docs' | 'calendar' | 'ai'

function useSidebarMode(): SidebarMode {
  const { pathname } = useLocation()
  if (pathname.startsWith('/workspace/tasks'))    return 'tasks'
  if (pathname.startsWith('/workspace/chat'))     return 'chat'
  if (pathname.startsWith('/workspace/docs'))     return 'docs'
  if (pathname.startsWith('/workspace/calendar')) return 'calendar'
  if (pathname.startsWith('/workspace/ai'))       return 'ai'
  // dashboard and any other /workspace/* falls to home
  return 'home'
}

// ---------------------------------------------------------------------------
// Shared helper components
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="sidebar-skeleton" aria-hidden="true">
      {[0.7, 0.5, 0.85].map((w, i) => (
        <div key={i} className="sidebar-skeleton-row" style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  )
}

function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="sidebar-section-error">
      <AlertCircle size={11} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--error)' }} />
      <span className="sidebar-section-error-text">{message}</span>
      {onRetry && (
        <button className="sidebar-section-retry" onClick={onRetry} title="Retry" aria-label="Retry loading this section">
          <RefreshCw size={10} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

function ItemBadge({ unread, badge }: { unread?: number; badge?: string }) {
  if (unread && unread > 0) {
    return <span className="sidebar-unread-badge">{unread > 99 ? '99+' : unread}</span>
  }
  if (badge) {
    return <span className="sidebar-badge">{badge}</span>
  }
  return null
}

// ---------------------------------------------------------------------------
// NavItem — a single navigation link in the sidebar body
// ---------------------------------------------------------------------------

export function NavItem({
  icon: Icon,
  label,
  to,
  count,
  end = false,
}: {
  icon: React.ElementType
  label: string
  to: string
  count?: number
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
      title={label}
    >
      <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="sidebar-nav-item-label">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="sidebar-nav-item-count">{count}</span>
      )}
    </NavLink>
  )
}


// ---------------------------------------------------------------------------
// Channels sub-section (Chat mode only)
// ---------------------------------------------------------------------------

function ChannelsSection({ filter }: { filter: string }) {
  const channels              = useChatStore((s) => s.channels)
  const channelsLoading       = useChatStore((s) => s.channelsLoading)
  const channelsError         = useChatStore((s) => s.channelsError)
  const unreadCounts          = useChatStore((s) => s.unreadCounts)
  const activeChannelId       = useChatStore((s) => s.activeChannelId)
  const fetchChannels         = useChatStore((s) => s.fetchChannels)
  const setActiveChannel      = useChatStore((s) => s.setActiveChannel)
  const setShowCreateChannel  = useChatStore((s) => s.setShowCreateChannel)
  const navigate              = useNavigate()
  const [open, setOpen]       = useState(true)

  // Only non-direct channels belong in the Channels section
  const regularChannels = channels.filter((c) => c.type !== 'DIRECT')
  const filteredChannels = regularChannels.filter((c) =>
    !filter || c.name?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="sidebar-subsection">
      <div
        className="sidebar-subsection-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
      >
        <ChevronRight size={10} strokeWidth={2.5} className={`sidebar-chevron${open ? ' open' : ''}`} />
        <Hash size={12} strokeWidth={1.75} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>Channels</span>
        <button
          className="sidebar-add-btn"
          title="New channel"
          aria-label="Create new channel"
          onClick={(e) => {
            e.stopPropagation()
            setShowCreateChannel(true)
            navigate('/workspace/chat?action=new-channel')
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div>
          {channelsLoading && <SectionSkeleton />}
          {/* Error: show inline notice but ALWAYS keep rendering existing channels below */}
          {!channelsLoading && channelsError && filteredChannels.length === 0 && (
            <SectionError message={channelsError} onRetry={fetchChannels} />
          )}
          {/* Empty state only when truly empty AND no error */}
          {!channelsLoading && !channelsError && filteredChannels.length === 0 && (
            <button
              className="sidebar-item"
              style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', paddingLeft: '1.25rem', gap: '0.375rem' }}
              onClick={(e) => {
                e.stopPropagation()
                setShowCreateChannel(true)
                navigate('/workspace/chat?action=new-channel')
              }}
              title={filter ? 'No matching channels — create one' : 'Create your first channel'}
            >
              <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="sidebar-item-label">{filter ? 'Create channel' : 'Create first channel'}</span>
            </button>
          )}
          {/* Always render channels if we have them, even if a later fetch errored */}
          {!channelsLoading && filteredChannels.map((ch) => {
            const unread = unreadCounts[ch.id] ?? 0
            const isActive = activeChannelId === ch.id
            const isPrivate = ch.type === 'PRIVATE'
            return (
              <button
                key={ch.id}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                title={ch.name ? `#${ch.name}` : 'channel'}
                onClick={async () => {
                  await setActiveChannel(ch.id)
                  navigate('/workspace/chat')
                }}
              >
                {isPrivate ? (
                  <Lock size={12} strokeWidth={1.75} style={{ flexShrink: 0, color: isActive ? 'var(--accent-brand)' : 'var(--text-disabled)' }} />
                ) : (
                  <span style={{ flexShrink: 0, fontSize: '0.8125rem', fontWeight: 600, color: isActive ? 'var(--accent-brand)' : 'var(--text-disabled)', lineHeight: 1 }}>#</span>
                )}
                <span className="sidebar-item-label">{ch.name}</span>
                <ItemBadge unread={unread} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Direct Messages sub-section (Chat mode only)
// ---------------------------------------------------------------------------

function DmSection({ filter }: { filter: string }) {
  const channels          = useChatStore((s) => s.channels)
  const unreadCounts      = useChatStore((s) => s.unreadCounts)
  const activeChannelId   = useChatStore((s) => s.activeChannelId)
  const setActiveChannel  = useChatStore((s) => s.setActiveChannel)
  const currentUserId     = useAuthStore((s) => s.user?.id)
  const navigate          = useNavigate()
  const [open, setOpen]   = useState(true)

  const dms = channels.filter((c) => c.type === 'DIRECT')
  const filteredDms = dms.filter((c) => {
    if (!filter) return true
    const otherMember = c.members.find((m) => m.user.id !== currentUserId)
    const name = otherMember?.user.displayName ?? ''
    return name.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div className="sidebar-subsection" style={{ marginTop: '0.625rem' }}>
      <div
        className="sidebar-subsection-header"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
      >
        <ChevronRight size={10} strokeWidth={2.5} className={`sidebar-chevron${open ? ' open' : ''}`} />
        <MessageSquare size={12} strokeWidth={1.75} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>Direct Messages</span>
        <button
          className="sidebar-add-btn"
          title="New direct message"
          aria-label="New direct message"
          onClick={(e) => {
            e.stopPropagation()
            navigate('/workspace/chat?action=new-dm')
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      {open && (
        <div>
          {filteredDms.length === 0 && !filter && (
            <button
              className="sidebar-item"
              style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', paddingLeft: '1.25rem', gap: '0.375rem' }}
              onClick={() => navigate('/workspace/chat?action=new-dm')}
              title="Start a new direct message"
            >
              <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="sidebar-item-label">New Message</span>
            </button>
          )}

          {filteredDms.length === 0 && filter && (
            <button
              className="sidebar-item"
              style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', paddingLeft: '1.25rem', gap: '0.375rem' }}
              onClick={() => navigate('/workspace/chat?action=new-dm')}
              title="No matching conversations — start a new message"
            >
              <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="sidebar-item-label">New Message</span>
            </button>
          )}

          {filteredDms.map((dm) => {
            const otherMember = dm.members.find((m) => m.user.id !== currentUserId)
            const name = otherMember?.user.displayName ?? 'Direct Message'
            const isActive = activeChannelId === dm.id
            const unread = unreadCounts[dm.id] ?? 0

            return (
              <button
                key={dm.id}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                title={name}
                onClick={async () => {
                  await setActiveChannel(dm.id)
                  navigate('/workspace/chat')
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--success)',
                    flexShrink: 0,
                  }}
                  title="Online"
                />
                <span className="sidebar-item-label">{name}</span>
                <ItemBadge unread={unread} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar mode content blocks
// Each block renders ONLY the content for its area.
// Full content for each mode will be built in tasks 1.2–1.7.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Home sidebar — views + quick-actions
// ---------------------------------------------------------------------------

/**
 * HomeViewItem — active when the URL matches the given pathname + optional view param.
 * viewKey=null means "no ?view= param" (the default overview state).
 */
export function HomeViewItem({
  icon: Icon,
  label,
  to,
  viewKey,
}: {
  icon: React.ElementType
  label: string
  to: string
  viewKey?: string | null
}) {
  const navigate        = useNavigate()
  const { pathname, search } = useLocation()
  const params          = new URLSearchParams(search)
  const currentView     = params.get('view')

  let isActive: boolean
  if (viewKey === undefined) {
    // Simple path match — active when on that exact path regardless of params
    isActive = pathname === to || pathname.startsWith(to + '?')
  } else if (viewKey === null) {
    // Default view — active when on the path with NO ?view= param
    isActive = pathname.startsWith('/workspace/dashboard') && currentView === null
  } else {
    // Specific view param
    isActive = pathname.startsWith('/workspace/dashboard') && currentView === viewKey
  }

  return (
    <button
      className={`sidebar-nav-item${isActive ? ' active' : ''}`}
      onClick={() => navigate(to)}
      title={label}
    >
      <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="sidebar-nav-item-label">{label}</span>
    </button>
  )
}

/** Home mode — Views + Quick Actions */
export function HomeSidebarContent() {
  const navigate           = useNavigate()
  const setShowCreate      = useChatStore((s) => s.setShowCreateChannel)

  return (
    <div className="sidebar-body no-scrollbar">
      {/* ── Views ── */}
      <div style={{ marginBottom: '0.125rem' }}>
        <HomeViewItem icon={LayoutDashboard} label="Overview"      to="/workspace/dashboard"              viewKey={null} />
        <HomeViewItem icon={CheckSquare}     label="My Tasks"      to="/workspace/tasks?view=my-tasks"    viewKey={undefined} />
        <HomeViewItem icon={Activity}        label="Activity Feed" to="/workspace/dashboard?view=activity" viewKey="activity" />
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ marginTop: '0.875rem' }}>
        <div className="sidebar-section-header-row">
          <span className="sidebar-group-label" style={{ margin: 0 }}>Quick Actions</span>
        </div>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-secondary)' }}
          title="Create a new task"
          onClick={() => navigate('/workspace/tasks?action=new-task')}
        >
          <Plus size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">New Task</span>
        </button>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-secondary)' }}
          title="Create a new channel"
          onClick={() => {
            setShowCreate(true)
            navigate('/workspace/chat?action=new-channel')
          }}
        >
          <Plus size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">New Channel</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tasks sidebar — Views section
// ---------------------------------------------------------------------------

/**
 * ViewItem — a fixed task-scope shortcut at the top of the Tasks sidebar.
 * Navigates to /workspace/tasks with a ?view= param for future wiring.
 * Shows as active when the param matches the current URL.
 */
function ViewItem({
  icon: Icon,
  label,
  viewKey,
}: {
  icon: React.ElementType
  label: string
  viewKey: string
}) {
  const navigate  = useNavigate()
  const { search } = useLocation()
  const params    = new URLSearchParams(search)
  const isActive  = params.get('view') === viewKey

  return (
    <button
      className={`sidebar-nav-item${isActive ? ' active' : ''}`}
      onClick={() => navigate(`/workspace/tasks?view=${viewKey}`)}
      title={label}
    >
      <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="sidebar-nav-item-label">{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tasks sidebar — Projects section
// ---------------------------------------------------------------------------

/**
 * ProjectEntry — a single, sleek project link.
 * Displays Folder icon, project name, and active selection highlight.
 * Clicking a project calls setActiveProject(p.id) and navigates to /workspace/tasks.
 */
function ProjectEntry({ project }: { project: { id: string; name: string } }) {
  const activeProjectId  = useTaskStore((s) => s.activeProjectId)
  const setActiveProject = useTaskStore((s) => s.setActiveProject)
  const navigate         = useNavigate()

  const isActive = activeProjectId === project.id

  const handleClick = async () => {
    await setActiveProject(project.id)
    navigate('/workspace/tasks')
  }

  return (
    <button
      className={`sidebar-nav-item${isActive ? ' active' : ''}`}
      onClick={handleClick}
      title={project.name}
    >
      <Folder
        size={14}
        strokeWidth={1.75}
        style={{
          color: isActive ? 'var(--accent-brand)' : 'var(--text-disabled)',
          flexShrink: 0,
        }}
      />
      <span className="sidebar-nav-item-label">{project.name}</span>
    </button>
  )
}

/**
 * ProjectsSection — the PROJECTS block in the Tasks sidebar.
 * Renders all projects from the store, each expandable into Board/List.
 * Shows a compact empty state if there are no projects yet.
 */
function ProjectsSection() {
  const projects        = useTaskStore((s) => s.projects)
  const projectsLoading = useTaskStore((s) => s.projectsLoading)
  const projectsError   = useTaskStore((s) => s.projectsError)
  const fetchProjects   = useTaskStore((s) => s.fetchProjects)
  const navigate        = useNavigate()

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {/* Section header */}
      <div className="sidebar-section-header-row">
        <span className="sidebar-group-label" style={{ margin: 0 }}>Projects</span>
        <button
          className="sidebar-add-btn"
          style={{ opacity: 1 }}
          title="Create new project"
          aria-label="Create new project"
          onClick={() => navigate('/workspace/tasks?action=new-project')}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      {/* Loading */}
      {projectsLoading && (
        <div className="sidebar-skeleton" aria-hidden="true" style={{ marginTop: '0.25rem' }}>
          {[0.8, 0.6, 0.75].map((w, i) => (
            <div key={i} className="sidebar-skeleton-row" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!projectsLoading && projectsError && (
        <SectionError message={projectsError} onRetry={fetchProjects} />
      )}

      {/* Empty state */}
      {!projectsLoading && !projectsError && projects.length === 0 && (
        <button
          className="sidebar-nav-item"
          style={{ paddingLeft: '0.625rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}
          onClick={() => navigate('/workspace/tasks?action=new-project')}
          title="Create your first project"
        >
          <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">Create first project</span>
        </button>
      )}

      {/* Project list */}
      {!projectsLoading && !projectsError && projects.map((p) => (
        <ProjectEntry key={p.id} project={p} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tasks mode — full production sidebar
// ---------------------------------------------------------------------------

/** Tasks mode — Views block + Projects block */
function TasksSidebarContent() {
  return (
    <div className="sidebar-body no-scrollbar">
      {/* ── Views ── */}
      <div style={{ marginBottom: '0.125rem' }}>
        <ViewItem icon={CheckSquare}  label="My Tasks"       viewKey="my-tasks" />
        <ViewItem icon={UserCheck}    label="Assigned by me" viewKey="assigned-by-me" />
        <ViewItem icon={CalendarClock} label="Due this week" viewKey="due-this-week" />
      </div>

      {/* ── Projects ── */}
      <ProjectsSection />
    </div>
  )
}

/** Chat mode — Channels + Direct Messages (Single Source of Truth) */
function ChatSidebarContent({ filter }: { filter: string }) {
  return (
    <div className="sidebar-body no-scrollbar">
      <ChannelsSection filter={filter} />
      <DmSection filter={filter} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Docs sidebar — view shortcut item (mirrors ViewItem in Tasks)
// ---------------------------------------------------------------------------

function DocsViewItem({
  icon: Icon,
  label,
  viewKey,
}: {
  icon: React.ElementType
  label: string
  viewKey: string | null
}) {
  const navigate    = useNavigate()
  const { search }  = useLocation()
  const params      = new URLSearchParams(search)
  const currentView = params.get('view')

  const isActive = viewKey === null ? currentView === null : currentView === viewKey

  const handleClick = () => {
    if (viewKey === null) {
      navigate('/workspace/docs')
    } else {
      navigate(`/workspace/docs?view=${viewKey}`)
    }
  }

  return (
    <button
      className={`sidebar-nav-item${isActive ? ' active' : ''}`}
      onClick={handleClick}
      title={label}
    >
      <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="sidebar-nav-item-label">{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Docs sidebar — collapsible Folders section (local state, no backend yet)
// ---------------------------------------------------------------------------

type DocFolder = { id: string; name: string }

function FoldersSection() {
  const navigate               = useNavigate()
  const [open, setOpen]        = useState(true)
  const [folders, setFolders]  = useState<DocFolder[]>([
    { id: 'f1', name: 'Engineering' },
    { id: 'f2', name: 'Design' },
    { id: 'f3', name: 'Product' },
  ])
  const { search }             = useLocation()
  const activeFolderId         = new URLSearchParams(search).get('folder')

  const handleCreate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const name = window.prompt('Folder name:')
    if (name?.trim()) {
      const id = `f${Date.now()}`
      setFolders((prev) => [...prev, { id, name: name.trim() }])
      navigate(`/workspace/docs?folder=${id}`)
    }
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {/* Section header */}
      <div className="sidebar-section-header-row">
        <span className="sidebar-group-label" style={{ margin: 0 }}>Folders</span>
        <button
          className="sidebar-add-btn"
          style={{ opacity: 1 }}
          title="New folder"
          aria-label="Create new folder"
          onClick={handleCreate}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      {/* Collapsible folder list header row */}
      <div
        className="sidebar-subsection-header"
        style={{ marginTop: '0.125rem' }}
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
      >
        <ChevronRight size={10} strokeWidth={2.5} className={`sidebar-chevron${open ? ' open' : ''}`} />
        <Folder size={12} strokeWidth={1.75} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>All Folders</span>
      </div>

      {open && (
        <div>
          {folders.length === 0 && (
            <button
              className="sidebar-nav-item"
              style={{ paddingLeft: '1.25rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}
              onClick={handleCreate}
              title="Create your first folder"
            >
              <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span className="sidebar-nav-item-label">New Folder</span>
            </button>
          )}
          {folders.map((folder) => {
            const isActive = activeFolderId === folder.id
            return (
              <button
                key={folder.id}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                title={folder.name}
                onClick={() => navigate(`/workspace/docs?folder=${folder.id}`)}
              >
                <Folder
                  size={12}
                  strokeWidth={1.75}
                  style={{ flexShrink: 0, color: isActive ? 'var(--accent-brand)' : 'var(--text-disabled)' }}
                />
                <span className="sidebar-item-label">{folder.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Docs mode — full production sidebar (Task 1.4) */
function DocsSidebarContent() {
  const navigate = useNavigate()

  return (
    <div className="sidebar-body no-scrollbar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Top Views ── */}
      <div style={{ marginBottom: '0.125rem' }}>
        <DocsViewItem icon={FileText} label="All Documents" viewKey={null} />
        <DocsViewItem icon={Clock}    label="Recent"        viewKey="recent" />
        <DocsViewItem icon={Star}     label="Starred"       viewKey="starred" />
      </div>

      {/* ── Folders ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="no-scrollbar">
        <FoldersSection />
      </div>

      {/* ── Bottom Utility ── */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.375rem', marginTop: '0.375rem' }}>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-tertiary)' }}
          title="Trash"
          onClick={() => navigate('/workspace/docs?view=trash')}
        >
          <Trash2 size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">Trash</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Calendar sidebar — Calendars + Event Types
// ---------------------------------------------------------------------------

/**
 * CalViewItem — active when the URL matches the given ?view= param.
 * viewKey=null means "no ?view= param" (My Schedule default).
 */
function CalViewItem({
  icon: Icon,
  label,
  viewKey,
}: {
  icon: React.ElementType
  label: string
  viewKey: string | null
}) {
  const navigate       = useNavigate()
  const { search }     = useLocation()
  const currentView    = new URLSearchParams(search).get('view')
  const isActive       = viewKey === null ? currentView === null : currentView === viewKey

  const handleClick = () => {
    if (viewKey === null) {
      navigate('/workspace/calendar')
    } else {
      navigate(`/workspace/calendar?view=${viewKey}`)
    }
  }

  return (
    <button
      className={`sidebar-nav-item${isActive ? ' active' : ''}`}
      onClick={handleClick}
      title={label}
    >
      <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="sidebar-nav-item-label">{label}</span>
    </button>
  )
}

/** A compact event-type filter row with a colored dot indicator */
function EventTypeRow({
  label,
  color,
}: {
  label: string
  color: string
}) {
  const [enabled, setEnabled] = useState(true)

  return (
    <button
      className="sidebar-nav-item"
      onClick={() => setEnabled((v) => !v)}
      title={`Toggle ${label}`}
      style={{ opacity: enabled ? 1 : 0.45 }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
          border: enabled ? 'none' : '1.5px solid var(--border-subtle)',
          boxSizing: 'border-box',
        }}
      />
      <span className="sidebar-nav-item-label">{label}</span>
    </button>
  )
}

/** Calendar mode — Calendars + Event Types */
function CalendarSidebarContent() {
  return (
    <div className="sidebar-body no-scrollbar">
      {/* ── Calendars ── */}
      <div style={{ marginBottom: '0.125rem' }}>
        <CalViewItem icon={CalendarDays} label="My Schedule"    viewKey={null} />
        <CalViewItem icon={Users}        label="Team Events"    viewKey="team" />
        <CalViewItem icon={Plane}        label="Leave & Time Off" viewKey="leaves" />
      </div>

      {/* ── Event Types ── */}
      <div style={{ marginTop: '0.875rem' }}>
        <div className="sidebar-section-header-row">
          <span className="sidebar-group-label" style={{ margin: 0 }}>Event Types</span>
        </div>
        <EventTypeRow label="Meetings"     color="var(--accent-brand, #f59e0b)" />
        <EventTypeRow label="Deadlines"    color="#ef4444" />
        <EventTypeRow label="Out of Office" color="#8b5cf6" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI sidebar — New Chat + Recent Chats + Templates
// ---------------------------------------------------------------------------

/** Shape of a local AI conversation session */
interface AiSession {
  id:        string
  title:     string
  /** Relative-time label shown next to the title */
  timeLabel: string
}

/** Seed sessions for the sidebar history (local state, no backend yet) */
const SEED_SESSIONS: AiSession[] = [
  { id: 's1', title: 'Summarise sprint retro notes',  timeLabel: '2h ago'      },
  { id: 's2', title: 'Draft onboarding email template', timeLabel: 'Yesterday'  },
  { id: 's3', title: 'Action items from #general',    timeLabel: '2 days ago'  },
]

/** AI mode — full production sidebar (Task 1.7) */
function AiSidebarContent() {
  const navigate                      = useNavigate()
  const { search }                    = useLocation()
  const activeSessionId               = new URLSearchParams(search).get('session')
  const [sessions]                    = useState<AiSession[]>(SEED_SESSIONS)

  /** Start a brand-new chat session and navigate to the bare /workspace/ai path */
  const handleNewChat = () => {
    navigate('/workspace/ai')
  }

  /** Activate an existing session (highlight it and navigate with ?session= param) */
  const handleSessionClick = (session: AiSession) => {
    navigate(`/workspace/ai?session=${session.id}`)
  }

  return (
    <div className="sidebar-body no-scrollbar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── New Chat button ── */}
      <div style={{ padding: '0 0.25rem 0.5rem' }}>
        <button
          className="sidebar-nav-item"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '0.4rem 0.625rem',
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.5rem',
            color: 'var(--accent-brand, #f59e0b)',
            fontWeight: 500,
            fontSize: '0.8125rem',
          }}
          title="Start a new AI conversation"
          onClick={handleNewChat}
        >
          <Sparkles size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span>New Chat</span>
        </button>
      </div>

      {/* ── Recent Chats ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <div className="sidebar-section-header-row">
          <span className="sidebar-group-label" style={{ margin: 0 }}>Recent Chats</span>
        </div>

        {sessions.length === 0 ? (
          /* Empty state */
          <button
            className="sidebar-nav-item"
            style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', paddingLeft: '0.5rem', gap: '0.375rem' }}
            onClick={handleNewChat}
            title="Start your first conversation"
          >
            <Plus size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span className="sidebar-nav-item-label">Start your first conversation</span>
          </button>
        ) : (
          sessions.map((session) => {
            const isActive = activeSessionId === session.id
            return (
              <button
                key={session.id}
                className={`sidebar-item${isActive ? ' active' : ''}`}
                title={session.title}
                onClick={() => handleSessionClick(session)}
                style={{ alignItems: 'flex-start', gap: '0.5rem' }}
              >
                <MessageSquare
                  size={12}
                  strokeWidth={1.75}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    color: isActive ? 'var(--accent-brand)' : 'var(--text-disabled)',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    textAlign: 'left',
                  }}
                >
                  <span
                    className="sidebar-item-label"
                    style={{
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? 'var(--text-primary)' : undefined,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {session.title}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', lineHeight: 1 }}>
                    {session.timeLabel}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* ── Templates & Shortcuts ── */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.375rem', marginTop: '0.375rem' }}>
        <div className="sidebar-section-header-row">
          <span className="sidebar-group-label" style={{ margin: 0 }}>Templates & Shortcuts</span>
        </div>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-secondary)' }}
          title="Summarize a channel's recent messages"
          onClick={() => navigate('/workspace/ai?template=summarize-channel')}
        >
          <ListChecks size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">Summarize Channel</span>
        </button>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-secondary)' }}
          title="Draft a document with AI assistance"
          onClick={() => navigate('/workspace/ai?template=draft-document')}
        >
          <FileEdit size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">Draft Document</span>
        </button>
        <button
          className="sidebar-nav-item"
          style={{ color: 'var(--text-secondary)' }}
          title="Extract action items from a message or doc"
          onClick={() => navigate('/workspace/ai?template=action-items')}
        >
          <CheckSquare size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span className="sidebar-nav-item-label">Extract Action Items</span>
        </button>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

/**
 * Context-aware secondary sidebar.
 *
 * Active mode is derived from the current pathname — mirroring exactly how
 * the rail's NavLink.isActive works. No new Zustand state introduced.
 *
 * Mode → content mapping:
 *   home     → HomeSidebarContent
 *   tasks    → TasksSidebarContent
 *   chat     → ChatSidebarContent
 *   docs     → DocsSidebarContent
 *   calendar → CalendarSidebarContent
 *   ai       → AiSidebarContent
 *
 * Data fetching is mode-aware: only the relevant stores are fetched.
 */
export function AppSidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const mode = useSidebarMode()
  const workspaceId = useAuthStore((s) => s.tenant?.workspaceId)
  const [chatFilter, setChatFilter] = useState('')

  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const fetchProjects = useTaskStore((s) => s.fetchProjects)

  // Fetch data for the active mode on mount and whenever mode or workspace changes.
  // Chat mode needs channels; Tasks mode needs projects.
  useEffect(() => {
    if (!workspaceId) return
    if (mode === 'chat') {
      fetchChannels()
    }
    if (mode === 'tasks') {
      fetchProjects()
    }
  }, [mode, workspaceId, fetchChannels, fetchProjects])

  // When on Home route, do NOT render a sidebar (dashboard expands to full width)
  if (mode === 'home') {
    return null
  }

  return (
    <aside
      className={`app-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}
      aria-label="Workspace navigation"
      aria-hidden={sidebarCollapsed}
    >
      {/* Sidebar header — collapse toggle only. Workspace identity lives in the topbar. */}
      <div className="sidebar-nav-topbar">
        {mode === 'chat' && !sidebarCollapsed && (
          <div className="sidebar-chat-search">
            <Search size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Find a channel…"
              value={chatFilter}
              onChange={(e) => setChatFilter(e.target.value)}
              className="sidebar-chat-search-input"
            />
            {chatFilter && (
              <button
                onClick={() => setChatFilter('')}
                className="sidebar-chat-search-clear"
                title="Clear"
              >
                <X size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed
            ? <PanelLeftOpen  size={13} strokeWidth={1.75} />
            : <PanelLeftClose size={13} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Context-aware body — switches based on active rail area */}
      {mode === 'tasks'    && <TasksSidebarContent />}
      {mode === 'chat'     && <ChatSidebarContent filter={chatFilter} />}
      {mode === 'docs'     && <DocsSidebarContent />}
      {mode === 'calendar' && <CalendarSidebarContent />}
      {mode === 'ai'       && <AiSidebarContent />}
    </aside>
  )
}
