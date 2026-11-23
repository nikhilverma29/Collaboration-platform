import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Loader2,
  ArrowRight,
  Crown,
  Shield,
  Briefcase,
  User,
  LogOut,
  AlertCircle,
} from 'lucide-react'
import api from '@/lib/api'
import { ThemeSelector } from '@/components/theme-selector'
import { useAuthStore } from '@/stores/auth-store'
import type { ApiSuccess, Workspace, WorkspaceMembership, WorkspaceRole } from '@/types'

// ---------------------------------------------------------------------------
// Role icons + labels
// ---------------------------------------------------------------------------

const ROLE_META: Record<WorkspaceRole, { label: string; icon: React.ElementType; color: string }> = {
  OWNER:    { label: 'Owner',   icon: Crown,    color: 'var(--accent-brand)' },
  ADMIN:    { label: 'Admin',   icon: Shield,   color: 'var(--priority-medium)' },
  MANAGER:  { label: 'Manager', icon: Briefcase,color: 'var(--success)' },
  EMPLOYEE: { label: 'Member',  icon: User,     color: 'var(--text-secondary)' },
}

// ---------------------------------------------------------------------------
// WorkspaceCard
// ---------------------------------------------------------------------------

interface WorkspaceCardProps {
  membership: WorkspaceMembership
  onSelect: (workspace: Workspace) => void
  loading: boolean
}

function WorkspaceCard({ membership, onSelect, loading }: WorkspaceCardProps) {
  const { workspace, role } = membership
  const meta = ROLE_META[role]
  const RoleIcon = meta.icon

  const initial = workspace.name[0]?.toUpperCase() ?? '?'

  return (
    <button
      onClick={() => onSelect(workspace)}
      disabled={loading}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-card)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        textAlign: 'left',
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
        transition: 'all var(--duration-fast) var(--ease-standard)',
        width: '100%',
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          const el = e.currentTarget
          el.style.borderColor = 'var(--accent-brand)'
          el.style.boxShadow = '0 0 0 3px var(--accent-ghost)'
          el.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border-card)'
        el.style.boxShadow = 'none'
        el.style.transform = 'none'
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* Workspace avatar */}
        <div
          style={{
            width: '2.5rem',
            height: '2.5rem',
            borderRadius: '0.5rem',
            background: 'var(--accent-ghost)',
            border: '1px solid var(--border-zone)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--accent-brand)',
            flexShrink: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {workspace.logoUrl ? (
            <img
              src={workspace.logoUrl}
              alt={workspace.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.4375rem' }}
            />
          ) : (
            initial
          )}
        </div>

        {/* Name + slug */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {workspace.name}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
              marginTop: '0.1875rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            syncra.app/{workspace.slug}
          </div>
        </div>

        {/* Arrow */}
        <ArrowRight
          size={16}
          strokeWidth={1.75}
          style={{ color: 'var(--text-disabled)', flexShrink: 0, marginTop: '0.1875rem' }}
        />
      </div>

      {/* Role badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3125rem',
            padding: '0.1875rem 0.5rem',
            borderRadius: '0.25rem',
            background: `${meta.color}14`,
            border: `1px solid ${meta.color}30`,
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: meta.color,
          }}
        >
          <RoleIcon size={10} strokeWidth={2} />
          {meta.label}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSelectPage
// ---------------------------------------------------------------------------

export default function WorkspaceSelectPage() {
  const navigate = useNavigate()
  const { user, memberships, setMemberships, setTenant, logout } = useAuthStore()

  const [loadingWorkspace, setLoadingWorkspace] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState(false)

  // Fetch memberships on mount if not already loaded
  useEffect(() => {
    if (memberships.length > 0) return

    let cancelled = false

    async function fetchMemberships() {
      try {
        const res = await api.get<ApiSuccess<WorkspaceMembership[]>>('/workspaces')
        if (!cancelled) {
          setMemberships(res.data.data)
          setHasFetched(true)
        }
      } catch {
        if (!cancelled) {
          setFetchError('Could not load your workspaces. Please refresh.')
          setHasFetched(true)
        }
      }
    }

    fetchMemberships()
    return () => { cancelled = true }
  }, [])

  async function handleSelect(workspace: Workspace) {
    setLoadingWorkspace(workspace.id)
    try {
      await api.post(`/workspaces/${workspace.id}/switch`)
      // Hydrate tenant context from the memberships we already have
      const membership = memberships.find((m) => m.workspace.id === workspace.id)
      if (membership) {
        setTenant({
          workspaceId: workspace.id,
          role: membership.role,
          workspace,
        })
      }
      navigate('/workspace/dashboard', { replace: true })
    } catch {
      setLoadingWorkspace(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) {
      setCreateError('Workspace name is required')
      return
    }

    setCreateLoading(true)
    setCreateError(null)

    try {
      const res = await api.post<ApiSuccess<Workspace>>('/workspaces', {
        name: createName.trim(),
        slug: createName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      })
      // Refresh memberships
      const wsRes = await api.get<ApiSuccess<WorkspaceMembership[]>>('/workspaces')
      setMemberships(wsRes.data.data)
      await handleSelect(res.data.data)
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ??
        err?.response?.data?.error ??
        'Failed to create workspace'
      setCreateError(typeof msg === 'string' ? msg : 'Failed to create workspace')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleLogout() {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    logout()
    navigate('/login', { replace: true })
  }

  // Loading = fetch hasn't completed yet (distinct from having 0 results)
  const isLoading = !hasFetched && !fetchError

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '50rem',
          height: '35rem',
          background: 'radial-gradient(ellipse at center, var(--accent-ghost) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div
        className="animate-fade-in"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '28rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.625rem',
              background: 'var(--accent-brand)',
              color: 'var(--accent-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              letterSpacing: '-0.03em',
              margin: '0 auto 1rem',
            }}
          >
            S
          </div>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            Choose a workspace
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.3125rem' }}>
            Signed in as{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>
          </p>
        </div>

        {/* Error */}
        {fetchError && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'var(--error-subtle)',
              border: '1px solid var(--error)',
              fontSize: '0.8125rem',
              color: 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={14} />
            {fetchError}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2].map((n) => (
              <div
                key={n}
                className="skeleton"
                style={{ height: '6rem', borderRadius: '0.75rem' }}
              />
            ))}
          </div>
        )}

        {/* Workspace list */}
        {memberships.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {memberships.map((m) => (
              <WorkspaceCard
                key={m.workspace.id}
                membership={m}
                onSelect={handleSelect}
                loading={loadingWorkspace === m.workspace.id}
              />
            ))}
          </div>
        )}

        {/* No workspaces */}
        {!isLoading && !fetchError && memberships.length === 0 && !creating && (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
            }}
          >
            You're not part of any workspace yet.
          </div>
        )}

        {/* Create workspace */}
        {creating ? (
          <form
            onSubmit={handleCreate}
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-card)',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.875rem',
            }}
          >
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Create a workspace
            </h2>

            <div className="form-field">
              <label className="form-label" htmlFor="ws-name">Workspace name</label>
              <input
                id="ws-name"
                type="text"
                className={`form-input${createError ? ' error' : ''}`}
                placeholder="e.g. Acme Inc"
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value)
                  setCreateError(null)
                }}
                disabled={createLoading}
                autoFocus
              />
              {createError && (
                <span className="form-error">
                  <AlertCircle size={11} />
                  {createError}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setCreating(false); setCreateName(''); setCreateError(null) }}
                disabled={createLoading}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createLoading}
                style={{ flex: 1 }}
              >
                {createLoading ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn btn-secondary btn-full"
            onClick={() => setCreating(true)}
            style={{ gap: '0.5rem' }}
          >
            <Plus size={15} strokeWidth={2} />
            Create new workspace
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            padding: '0.25rem',
            transition: 'color var(--duration-fast) var(--ease-standard)',
            margin: '0 auto',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <LogOut size={12} />
          Sign out
        </button>

        {/* Theme selector */}
        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'center' }}>
          <ThemeSelector />
        </div>
      </div>
    </div>
  )
}
