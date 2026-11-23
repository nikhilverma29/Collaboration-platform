import { useState, useEffect } from 'react'
import {
  User, Building2, Users, ChevronRight, Check,
  Loader2, AlertCircle, Copy, CheckCheck, Trash2,
  Shield, Crown, Eye, X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { userApi, workspaceSettingsApi } from '@/lib/settings-api'
import type { WorkspaceMember } from '@/lib/settings-api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsSection = 'profile' | 'workspace' | 'members'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

function RoleIcon({ role }: { role: string }) {
  if (role === 'OWNER') return <Crown size={11} strokeWidth={2} style={{ color: 'var(--priority-high)' }} />
  if (role === 'ADMIN') return <Shield size={11} strokeWidth={2} style={{ color: 'var(--accent-brand)' }} />
  return <Eye size={11} strokeWidth={2} style={{ color: 'var(--text-tertiary)' }} />
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    OWNER:   'var(--priority-high)',
    ADMIN:   'var(--accent-brand)',
    MANAGER: 'var(--priority-medium)',
    EMPLOYEE:'var(--text-tertiary)',
  }
  const color = colors[role] ?? 'var(--text-tertiary)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      fontSize: '0.5625rem', fontWeight: 600, letterSpacing: '0.03em',
      padding: '0.125rem 0.375rem', borderRadius: '0.25rem',
      background: `${color}14`, color,
    }}>
      <RoleIcon role={role} />
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid var(--border-zone)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: 'var(--accent-brand)',
      background: 'var(--accent-ghost)',
      flexShrink: 0, letterSpacing: '0.02em', lineHeight: 1,
    }}>
      {initials(name)}
    </div>
  )
}

function StatusBanner({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 0.75rem', borderRadius: '0.5rem', marginBottom: '1rem',
      background: type === 'success' ? 'var(--success-subtle)' : 'oklch(0.97 0.02 27)',
      border: `1px solid ${type === 'success' ? 'var(--success)' : 'var(--error)'}30`,
      fontSize: '0.8125rem', color: type === 'success' ? 'var(--success)' : 'var(--error)',
    }}>
      {type === 'success' ? <Check size={13} strokeWidth={2.5} /> : <AlertCircle size={13} strokeWidth={2} />}
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Profile
// ---------------------------------------------------------------------------

function ProfileSection() {
  const { user, setUser } = useAuthStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<{ type: 'success'|'error'; msg: string } | null>(null)

  // Password change
  const [currPwd,  setCurrPwd]  = useState('')
  const [newPwd,   setNewPwd]   = useState('')
  const [confPwd,  setConfPwd]  = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdStatus, setPwdStatus] = useState<{ type: 'success'|'error'; msg: string } | null>(null)

  const saveProfile = async () => {
    if (!displayName.trim()) return
    setSaving(true); setStatus(null)
    try {
      const updated = await userApi.updateProfile({ displayName: displayName.trim() })
      setUser(updated)
      setStatus({ type: 'success', msg: 'Profile updated successfully' })
    } catch (e: any) {
      setStatus({ type: 'error', msg: e?.response?.data?.error ?? 'Failed to update profile' })
    } finally { setSaving(false) }
  }

  const changePassword = async () => {
    if (!currPwd || !newPwd) { setPwdStatus({ type: 'error', msg: 'All fields are required' }); return }
    if (newPwd !== confPwd) { setPwdStatus({ type: 'error', msg: 'New passwords do not match' }); return }
    if (newPwd.length < 8)  { setPwdStatus({ type: 'error', msg: 'Password must be at least 8 characters' }); return }
    setPwdSaving(true); setPwdStatus(null)
    try {
      await userApi.changePassword({ currentPassword: currPwd, newPassword: newPwd })
      setPwdStatus({ type: 'success', msg: 'Password changed successfully' })
      setCurrPwd(''); setNewPwd(''); setConfPwd('')
    } catch (e: any) {
      setPwdStatus({ type: 'error', msg: e?.response?.data?.error ?? 'Failed to change password' })
    } finally { setPwdSaving(false) }
  }

  return (
    <div className="settings-sections">
      {/* Profile info */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title">Profile Information</h3>
          <p className="settings-card-desc">Update your display name and how you appear across the workspace.</p>
        </div>
        <div className="settings-card-body">
          {status && <StatusBanner type={status.type} message={status.msg} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <Avatar name={displayName || user?.displayName || '?'} size={52} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.displayName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                {user?.email}
              </div>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-label">Display Name</label>
            <input
              className="settings-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveProfile()}
              placeholder="Your display name"
            />
          </div>

          <div className="settings-field">
            <label className="settings-label">Email address</label>
            <input className="settings-input" value={user?.email ?? ''} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            <p className="settings-hint">Email cannot be changed from here.</p>
          </div>
        </div>
        <div className="settings-card-footer">
          <button className="settings-btn primary" onClick={saveProfile} disabled={saving || !displayName.trim()}>
            {saving ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={13} strokeWidth={2.5} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title">Change Password</h3>
          <p className="settings-card-desc">Use a strong password with at least 8 characters.</p>
        </div>
        <div className="settings-card-body">
          {pwdStatus && <StatusBanner type={pwdStatus.type} message={pwdStatus.msg} />}
          <div className="settings-field">
            <label className="settings-label">Current Password</label>
            <input type="password" className="settings-input" value={currPwd}
              onChange={e => setCurrPwd(e.target.value)} placeholder="Enter current password" />
          </div>
          <div className="settings-field">
            <label className="settings-label">New Password</label>
            <input type="password" className="settings-input" value={newPwd}
              onChange={e => setNewPwd(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="settings-field">
            <label className="settings-label">Confirm New Password</label>
            <input type="password" className="settings-input" value={confPwd}
              onChange={e => setConfPwd(e.target.value)} placeholder="Repeat new password"
              onKeyDown={e => e.key === 'Enter' && changePassword()} />
          </div>
        </div>
        <div className="settings-card-footer">
          <button className="settings-btn primary" onClick={changePassword} disabled={pwdSaving}>
            {pwdSaving ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={13} strokeWidth={2.5} />}
            Update Password
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Workspace
// ---------------------------------------------------------------------------

function WorkspaceSection() {
  const { tenant, setTenant } = useAuthStore()
  const workspace = tenant?.workspace
  const [name,    setName]   = useState(workspace?.name ?? '')
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<{ type: 'success'|'error'; msg: string } | null>(null)
  const [copied,  setCopied]  = useState(false)

  const save = async () => {
    if (!name.trim() || !workspace) return
    setSaving(true); setStatus(null)
    try {
      await workspaceSettingsApi.update(workspace.id, { name: name.trim() })
      if (tenant) {
        setTenant({ ...tenant, workspace: { ...workspace, name: name.trim() } })
      }
      setStatus({ type: 'success', msg: 'Workspace name updated' })
    } catch (e: any) {
      setStatus({ type: 'error', msg: e?.response?.data?.error ?? 'Failed to update workspace' })
    } finally { setSaving(false) }
  }

  const copyInviteCode = () => {
    if (!workspace?.inviteCode) return
    navigator.clipboard.writeText(workspace.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="settings-sections">
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title">Workspace Settings</h3>
          <p className="settings-card-desc">Manage your workspace name and general configuration.</p>
        </div>
        <div className="settings-card-body">
          {status && <StatusBanner type={status.type} message={status.msg} />}
          <div className="settings-field">
            <label className="settings-label">Workspace Name</label>
            <input className="settings-input" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="Workspace name" />
          </div>
          <div className="settings-field">
            <label className="settings-label">Workspace Slug</label>
            <input className="settings-input" value={workspace?.slug ?? ''} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed', fontFamily: 'monospace', fontSize: '0.8125rem' }} />
            <p className="settings-hint">Slug is permanent and cannot be changed.</p>
          </div>
          <div className="settings-field">
            <label className="settings-label">Workspace ID</label>
            <input className="settings-input" value={workspace?.id ?? ''} disabled
              style={{ opacity: 0.6, cursor: 'not-allowed', fontFamily: 'monospace', fontSize: '0.75rem' }} />
          </div>
        </div>
        <div className="settings-card-footer">
          <button className="settings-btn primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={13} strokeWidth={2.5} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Invite code */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h3 className="settings-card-title">Invite Code</h3>
          <p className="settings-card-desc">Share this code with people you want to invite. They can join from the workspace select screen.</p>
        </div>
        <div className="settings-card-body">
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <div style={{
              flex: 1, padding: '0.625rem 0.875rem',
              background: 'var(--surface-1)', border: '1px solid var(--border-zone)',
              borderRadius: '0.4375rem', fontFamily: 'monospace', fontSize: '1rem',
              fontWeight: 700, letterSpacing: '0.15em', color: 'var(--accent-brand)',
            }}>
              {workspace?.inviteCode ?? '—'}
            </div>
            <button
              className="settings-btn secondary"
              onClick={copyInviteCode}
              style={{ flexShrink: 0, minWidth: '5.5rem' }}
            >
              {copied ? <CheckCheck size={13} strokeWidth={2.5} style={{ color: 'var(--success)' }} /> : <Copy size={13} strokeWidth={1.75} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section: Members
// ---------------------------------------------------------------------------

function MembersSection() {
  const { tenant, user } = useAuthStore()
  const [members,  setMembers]  = useState<WorkspaceMember[]>([])
  const [loading,  setLoading]  = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceMember | null>(null)

  useEffect(() => {
    if (!tenant?.workspaceId) return
    workspaceSettingsApi.getMembers(tenant.workspaceId)
      .then(setMembers)
      .catch(() => setError('Failed to load members'))
      .finally(() => setLoading(false))
  }, [tenant?.workspaceId])

  const removeMember = async (member: WorkspaceMember) => {
    if (!tenant?.workspaceId) return
    setRemoving(member.id); setConfirmRemove(null)
    try {
      await workspaceSettingsApi.removeMember(tenant.workspaceId, member.id)
      setMembers(m => m.filter(x => x.id !== member.id))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to remove member')
    } finally { setRemoving(null) }
  }

  const isOwnerOrAdmin = tenant?.role === 'OWNER' || tenant?.role === 'ADMIN'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.5rem', color: 'var(--text-tertiary)' }}>
      <Loader2 size={18} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: '0.875rem' }}>Loading members…</span>
    </div>
  )

  return (
    <div className="settings-sections">
      <div className="settings-card">
        <div className="settings-card-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 className="settings-card-title">Members</h3>
              <p className="settings-card-desc">{members.length} {members.length === 1 ? 'person' : 'people'} in this workspace.</p>
            </div>
          </div>
        </div>

        {error && <div style={{ padding: '0 1rem' }}><StatusBanner type="error" message={error} /></div>}

        <div className="settings-member-list">
          {members.map(member => {
            const isSelf = member.id === user?.id
            const isOwner = member.role === 'OWNER'
            const canRemove = isOwnerOrAdmin && !isSelf && !isOwner

            return (
              <div key={member.id} className="settings-member-row">
                <Avatar name={member.displayName} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {member.displayName}
                    </span>
                    {isSelf && (
                      <span style={{ fontSize: '0.5625rem', fontWeight: 600, padding: '0.0625rem 0.3125rem', borderRadius: '0.25rem', background: 'var(--surface-hover)', color: 'var(--text-tertiary)' }}>
                        You
                      </span>
                    )}
                    <RoleBadge role={member.role} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.0625rem' }}>
                    {member.email}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-disabled)' }}>
                    Joined {new Date(member.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                  {canRemove && (
                    removing === member.id ? (
                      <Loader2 size={14} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-tertiary)' }} />
                    ) : (
                      <button
                        className="settings-member-remove"
                        onClick={() => setConfirmRemove(member)}
                        title="Remove from workspace"
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Confirm remove dialog */}
      {confirmRemove && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300, backdropFilter: 'blur(3px)' }}
            onClick={() => setConfirmRemove(null)} />
          <div className="modal" style={{ zIndex: 301, maxWidth: '24rem' }}>
            <div className="modal-header">
              <span className="modal-title">Remove Member</span>
              <button className="modal-close" onClick={() => setConfirmRemove(null)}><X size={14} strokeWidth={2} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Remove <strong style={{ color: 'var(--text-primary)' }}>{confirmRemove.displayName}</strong> from{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{tenant?.workspace.name}</strong>? They will lose access to all projects and data.
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button
                className="modal-btn"
                onClick={() => removeMember(confirmRemove)}
                style={{ background: 'var(--error)', color: '#fff' }}
              >
                <Trash2 size={13} strokeWidth={2} /> Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('profile')

  const NAV: { id: SettingsSection; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'profile',   label: 'Profile',   icon: User,      desc: 'Your name and password' },
    { id: 'workspace', label: 'Workspace', icon: Building2, desc: 'Name and invite code' },
    { id: 'members',   label: 'Members',   icon: Users,     desc: 'Manage team access' },
  ]

  return (
    <div className="settings-page">
      {/* Sidebar nav */}
      <aside className="settings-nav">
        <div className="settings-nav-header">Settings</div>
        {NAV.map(item => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              className={`settings-nav-item${active ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              <div className="settings-nav-icon">
                <Icon size={14} strokeWidth={1.75} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="settings-nav-label">{item.label}</div>
                <div className="settings-nav-desc">{item.desc}</div>
              </div>
              {active && <ChevronRight size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
            </button>
          )
        })}
      </aside>

      {/* Content */}
      <main className="settings-content">
        <div className="settings-section-title">
          {NAV.find(n => n.id === section)?.label}
        </div>
        {section === 'profile'   && <ProfileSection />}
        {section === 'workspace' && <WorkspaceSection />}
        {section === 'members'   && <MembersSection />}
      </main>
    </div>
  )
}
