import { useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import {
  Search,
  Bell,
  Plus,
  PanelLeftOpen,
  ChevronDown,
  CheckSquare,
  MessageSquare,
  FileText,
  FolderPlus,
  Users,
  Command,
  LogOut,
  Settings,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { ThemeSelector } from '@/components/theme-selector'

const SEGMENT_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  dashboard: 'Home',
  tasks:     'Tasks',
  chat:      'Chat',
  docs:      'Docs',
  calendar:  'Calendar',
  ai:        'AI Copilot',
  /*
   * 'settings' is reached via Profile (single canonical entry point).
   * Label it as 'Settings & Profile' so the breadcrumb reflects the
   * unified purpose of the page rather than a generic gear-icon label.
   */
  settings:  'Settings & Profile',
  projects:  'Projects',
}

function useBreadcrumbs() {
  const location = useLocation()
  const subLabel = useBreadcrumbStore((s) => s.subLabel)
  const segments = location.pathname.split('/').filter(Boolean)
  const crumbs = segments.map((seg, i) => ({
    label: SEGMENT_LABELS[seg] ?? seg,
    to: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1 && !subLabel,
  }))
  // Append the sub-entity label pushed by the active page (e.g. '#main-work', 'Project Name')
  if (subLabel) {
    crumbs.push({ label: subLabel, to: '', isLast: true })
  }
  return crumbs
}

const CREATE_ITEMS = [
  { icon: CheckSquare,   label: 'New Task',      shortcut: 'T' },
  { icon: MessageSquare, label: 'New Message',   shortcut: 'M' },
  { icon: FileText,      label: 'New Doc',       shortcut: 'D' },
  { icon: FolderPlus,    label: 'New Space',     shortcut: 'S' },
  { icon: Users,         label: 'Invite People', shortcut: 'I' },
]

export function Topbar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const user    = useAuthStore((s) => s.user)
  const logout  = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const breadcrumbs   = useBreadcrumbs()
  const displayCrumbs = breadcrumbs.filter((c) => c.label !== 'Workspace')

  const [createOpen,  setCreateOpen]  = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const unreadCount = 3

  const userInitials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?'

  const closeAll = () => {
    setCreateOpen(false)
    setNotifOpen(false)
    setProfileOpen(false)
  }

  return (
    <header className="topbar" role="banner">

      {/* LEFT */}
      <div className="topbar-left">
        {sidebarCollapsed && (
          <button className="topbar-icon-btn" onClick={toggleSidebar} title="Open sidebar" aria-label="Open sidebar">
            <PanelLeftOpen size={15} strokeWidth={1.75} />
          </button>
        )}

        {displayCrumbs.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {displayCrumbs.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {i > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
                {crumb.isLast
                  ? <span className="breadcrumb-item current">{crumb.label}</span>
                  : <Link to={crumb.to} className="breadcrumb-item">{crumb.label}</Link>}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* CENTER */}
      <div className="topbar-search-wrap">
        <button id="global-search-trigger" className="topbar-search-pill" title="Search (Cmd+K)" aria-label="Open global search" onClick={onOpenSearch}>
          <Search size={13} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <span className="topbar-search-placeholder">Search Syncra or jump to anything…</span>
          <span className="topbar-search-kbd">
            <Command size={10} strokeWidth={1.75} />
            <span>K</span>
          </span>
        </button>
      </div>

      {/* RIGHT */}
      <div className="topbar-right">

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button
            id="notifications-btn"
            className="topbar-icon-btn"
            title={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
            aria-label="Notifications"
            onClick={() => { setNotifOpen((o) => !o); setCreateOpen(false); setProfileOpen(false) }}
          >
            <Bell size={15} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="topbar-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="topbar-popover" style={{ width: '20rem', right: 0 }} role="dialog" aria-label="Notifications">
              <div className="topbar-popover-header">
                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Notifications</span>
                <button style={{ fontSize: '0.6875rem', color: 'var(--accent-brand)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setNotifOpen(false)}>
                  Mark all read
                </button>
              </div>
              {[
                { text: 'Alice commented on API rate limit task', time: '2m ago', unread: true },
                { text: 'Bob invited you to #engineering', time: '14m ago', unread: true },
                { text: 'Sprint planning notes updated', time: '1h ago', unread: true },
                { text: 'Priya started a DM with you', time: '3h ago', unread: false },
              ].map((n, i) => (
                <div key={i} className={`topbar-notif-item${n.unread ? ' unread' : ''}`}>
                  {n.unread && <span className="topbar-notif-dot" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>{n.text}</p>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', margin: '0.125rem 0 0' }}>{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New / Create */}
        <div style={{ position: 'relative', marginLeft: '0.25rem' }}>
          <button
            id="create-new-btn"
            className="topbar-btn primary"
            title="Create new"
            aria-label="Create new"
            aria-expanded={createOpen}
            aria-haspopup="true"
            onClick={() => { setCreateOpen((o) => !o); setNotifOpen(false); setProfileOpen(false) }}
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>New</span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7, marginLeft: '-0.125rem' }} />
          </button>

          {createOpen && (
            <div className="topbar-popover" style={{ width: '13rem', right: 0 }} role="menu" aria-label="Create actions">
              <div className="topbar-popover-header" style={{ paddingBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.6875rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Create</span>
              </div>
              {CREATE_ITEMS.map(({ icon: Icon, label, shortcut }) => (
                <button key={label} className="topbar-menu-item" role="menuitem" onClick={() => setCreateOpen(false)}>
                  <Icon size={13} strokeWidth={1.75} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                  <kbd className="topbar-shortcut">{shortcut}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile avatar — opens account/appearance popover */}
        <div style={{ position: 'relative', marginLeft: '0.25rem' }}>
          <button
            id="profile-btn"
            className="topbar-profile-btn"
            title={`${user?.displayName ?? 'Profile'} · Settings`}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            onClick={() => { setProfileOpen((o) => !o); setCreateOpen(false); setNotifOpen(false) }}
          >
            {userInitials}
          </button>

          {profileOpen && (
            <div
              className="topbar-popover"
              style={{ width: '15rem', right: 0 }}
              role="dialog"
              aria-label="Profile and preferences"
            >
              {/* User identity */}
              <div className="topbar-popover-header" style={{ paddingBottom: '0.375rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="topbar-profile-btn" style={{ width: '2rem', height: '2rem', fontSize: '0.5625rem', cursor: 'default', flexShrink: 0 }}>
                    {userInitials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.displayName ?? 'Profile'}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email ?? ''}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0 0 0.25rem' }} />

              {/* Theme toggle — Appearance section */}
              <div style={{ padding: '0.25rem 0.625rem 0.375rem' }}>
                <div style={{ fontSize: '0.5625rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginBottom: '0.375rem' }}>
                  Appearance
                </div>
                <ThemeSelector />
              </div>

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '0.25rem 0' }} />

              {/* Settings link */}
              <button
                className="topbar-menu-item"
                role="menuitem"
                onClick={() => { closeAll(); navigate('/workspace/settings') }}
              >
                <Settings size={13} strokeWidth={1.75} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Settings &amp; Profile</span>
              </button>

              {/* Sign out */}
              <button
                className="topbar-menu-item"
                role="menuitem"
                style={{ color: 'var(--error)' }}
                onClick={() => {
                  closeAll()
                  logout()
                  navigate('/login')
                }}
              >
                <LogOut size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Backdrop to close popovers */}
      {(createOpen || notifOpen || profileOpen) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={closeAll}
          aria-hidden="true"
        />
      )}
    </header>
  )
}
