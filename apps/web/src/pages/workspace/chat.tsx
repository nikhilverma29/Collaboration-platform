import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Hash, Lock, Plus, Send, Smile,
  Edit3, Trash2, X, Loader2, MessageSquare,
  Users, CheckSquare,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { useTaskStore } from '@/stores/task-store'
import { messagesApi } from '@/lib/chat-api'
import type { Channel, ChatMessage } from '@/lib/chat-api'
import { workspaceSettingsApi } from '@/lib/settings-api'
import { projectsApi, boardsApi, tasksApi } from '@/lib/tasks-api'
import type { Task, TaskPriority, TaskStatus } from '@/types'

// ---------------------------------------------------------------------------
// Emoji quick-picker (minimal — 12 common emojis)
// ---------------------------------------------------------------------------

const QUICK_EMOJIS = ['👍','❤️','😂','🎉','🔥','👀','✅','🙏','😮','😢','💯','🚀']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--accent-ghost)', border: '1.5px solid var(--border-zone)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: 'var(--accent-brand)',
      flexShrink: 0, letterSpacing: '0.02em', lineHeight: 1,
    }}>
      {initials}
    </div>
  )
}

function ChannelIcon({ type, size = 13 }: { type: string; size?: number }) {
  if (type === 'DIRECT') return <span style={{ fontSize: size * 1.1, lineHeight: 1 }}>💬</span>
  if (type === 'PRIVATE') return <Lock size={size} strokeWidth={1.75} />
  return <Hash size={size} strokeWidth={1.75} />
}

// ---------------------------------------------------------------------------
// Task Unfurl Components (Feature 6)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: 'To Do', color: 'var(--text-tertiary)', bg: 'var(--surface-hover)' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--accent-brand)', bg: 'var(--accent-ghost)' },
  IN_REVIEW: { label: 'In Review', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.12)' },
  DONE: { label: 'Done', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
  CANCELLED: { label: 'Cancelled', color: 'var(--text-disabled)', bg: 'var(--surface-active)' },
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: '⚪ Low',
  MEDIUM: '🟡 Medium',
  HIGH: '🟠 High',
  URGENT: '🔴 Urgent',
}

interface TaskUnfurlCardProps {
  code: string // e.g. "K8Z98Q"
  onNavigate: (taskId: string) => void
}

function TaskUnfurlCard({ code, onNavigate }: TaskUnfurlCardProps) {
  const tasksByColumn = useTaskStore((s) => s.tasksByColumn)
  const projects = useTaskStore((s) => s.projects)
  const [resolution, setResolution] = useState<'loading' | 'found' | 'not_found'>('loading')
  const [resolvedTask, setResolvedTask] = useState<Task | null>(null)

  useEffect(() => {
    let isMounted = true
    const upperCode = code.toUpperCase()

    // 1. Check local tasksByColumn first
    const allLocal = Object.values(tasksByColumn).flat()
    const match = allLocal.find((t) => t.id.slice(-6).toUpperCase() === upperCode)

    if (match) {
      setResolvedTask(match)
      setResolution('found')
      return
    }

    // 2. If not found locally, search workspace projects
    const searchWorkspace = async () => {
      try {
        let currentProjects = projects
        if (currentProjects.length === 0) {
          currentProjects = await projectsApi.list().catch(() => [])
        }
        for (const p of currentProjects) {
          const pTasks = await tasksApi.list({ projectId: p.id }).catch(() => [])
          const found = pTasks.find((t) => t.id.slice(-6).toUpperCase() === upperCode)
          if (found) {
            if (isMounted) {
              setResolvedTask(found)
              setResolution('found')
            }
            return
          }
        }
        if (isMounted) {
          setResolution('not_found')
        }
      } catch {
        if (isMounted) {
          setResolution('not_found')
        }
      }
    }

    searchWorkspace()

    return () => {
      isMounted = false
    }
  }, [code, tasksByColumn, projects])

  if (resolution === 'loading') {
    return (
      <div className="task-unfurl-card" style={{ cursor: 'default' }}>
        <div className="task-unfurl-card-accent" />
        <div className="task-unfurl-card-body">
          <div className="task-unfurl-card-top">
            <span className="msg-task-badge-code">SYN-{code.toUpperCase()}</span>
            <div className="task-unfurl-card-skeleton" />
          </div>
        </div>
      </div>
    )
  }

  if (resolution === 'not_found' || !resolvedTask) {
    return (
      <div className="task-unfurl-card" style={{ cursor: 'default', opacity: 0.85 }}>
        <div className="task-unfurl-card-accent" style={{ background: 'var(--border-zone)' }} />
        <div className="task-unfurl-card-body">
          <div className="task-unfurl-card-top">
            <span className="msg-task-badge-code" style={{ opacity: 0.7 }}>
              SYN-{code.toUpperCase()}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-disabled)' }}>
              Task not found in this workspace
            </span>
          </div>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_CONFIG[resolvedTask.status] || STATUS_CONFIG.TODO
  const priorityText = PRIORITY_LABELS[resolvedTask.priority] || resolvedTask.priority
  const assigneeText = resolvedTask.assignee?.displayName ? `👤 ${resolvedTask.assignee.displayName}` : '👤 Unassigned'

  return (
    <div
      className="task-unfurl-card"
      onClick={() => onNavigate(resolvedTask.id)}
      title={`Open task: ${resolvedTask.title}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate(resolvedTask.id)
        }
      }}
    >
      <div className="task-unfurl-card-accent" style={{ background: statusInfo.color }} />
      <div className="task-unfurl-card-body">
        <div className="task-unfurl-card-top">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: statusInfo.color,
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          <span className="msg-task-badge-code">
            SYN-{code.toUpperCase()}
          </span>
          <span className="task-unfurl-card-title">
            {resolvedTask.title}
          </span>
        </div>
        <div className="task-unfurl-card-meta">
          <span
            className="task-unfurl-status-pill"
            style={{ color: statusInfo.color, background: statusInfo.bg }}
          >
            ● {statusInfo.label}
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              color: 'var(--text-secondary)',
              background: 'var(--surface-hover)',
              padding: '0.0625rem 0.375rem',
              borderRadius: '0.25rem',
            }}
          >
            {priorityText}
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              color: 'var(--text-tertiary)',
            }}
          >
            {assigneeText}
          </span>
        </div>
      </div>
    </div>
  )
}

interface MessageContentProps {
  content: string
  onNavigate: (taskId: string) => void
}

function MessageContent({ content, onNavigate }: MessageContentProps) {
  const matches = Array.from(content.matchAll(/(#?SYN-([A-Z0-9]{6}))\b/gi))

  if (matches.length === 0) {
    return <p className="chat-message-content">{content}</p>
  }

  interface Segment {
    text: string
    isToken: boolean
    code?: string
  }

  const segments: Segment[] = []
  let lastIndex = 0

  for (const match of matches) {
    const matchIndex = match.index ?? 0
    const matchFull = match[0]
    const rawCode = match[2].toUpperCase()

    if (matchIndex > lastIndex) {
      segments.push({
        text: content.slice(lastIndex, matchIndex),
        isToken: false,
      })
    }

    segments.push({
      text: `SYN-${rawCode}`,
      isToken: true,
      code: rawCode,
    })

    lastIndex = matchIndex + matchFull.length
  }

  if (lastIndex < content.length) {
    segments.push({
      text: content.slice(lastIndex),
      isToken: false,
    })
  }

  // Unique codes
  const uniqueCodes: string[] = []
  for (const m of matches) {
    const code = m[2].toUpperCase()
    if (!uniqueCodes.includes(code)) {
      uniqueCodes.push(code)
    }
  }

  return (
    <>
      <p className="chat-message-content">
        {segments.map((seg, i) =>
          seg.isToken ? (
            <span key={i} className="syn-ref-token">
              #{seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
      {uniqueCodes.map((code) => (
        <TaskUnfurlCard key={code} code={code} onNavigate={onNavigate} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
  isMine,
  isContinued,
  onEdit,
  onDelete,
  onReact,
  onCreateTask,
  linkedTask,
}: {
  msg: ChatMessage
  isMine: boolean
  isContinued?: boolean
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onReact: (id: string, emoji: string) => void
  onCreateTask: (msg: ChatMessage) => void
  linkedTask?: { id: string; title: string; code: string }
}) {
  const [hovered, setHovered] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const navigate = useNavigate()

  if (msg.isDeleted) {
    return (
      <div className="chat-message deleted">
        <div style={{ width: 28, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-disabled)', fontStyle: 'italic' }}>
          [This message was deleted]
        </span>
      </div>
    )
  }

  // Group reactions by emoji
  const reactionMap: Record<string, { emoji: string; count: number; mine: boolean }> = {}
  for (const r of msg.reactions) {
    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, mine: false }
    reactionMap[r.emoji].count++
  }

  return (
    <div
      className={`chat-message${hovered ? ' hovered' : ''}${isContinued ? ' continued' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setEmojiOpen(false) }}
    >
      {/* Avatar or Gutter */}
      {isContinued ? (
        <div className="chat-msg-gutter">
          <span className="chat-msg-cont-time">{formatTime(msg.createdAt)}</span>
        </div>
      ) : (
        <Avatar name={msg.author.displayName} size={28} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Author + time */}
        {!isContinued && (
          <div className="chat-message-header">
            <span className="chat-message-author">{msg.author.displayName}</span>
            <span className="chat-message-time">{formatTime(msg.createdAt)}</span>
            {msg.isEdited && <span style={{ fontSize: '0.625rem', color: 'var(--text-disabled)' }}>(edited)</span>}
          </div>
        )}

        {/* Content with inline SYN-ref detection */}
        <MessageContent
          content={msg.content}
          onNavigate={(taskId) => navigate(`/workspace/tasks?taskId=${taskId}`)}
        />

        {/* Linked task badge */}
        {linkedTask && (
          <div
            className="msg-task-badge"
            onClick={() => navigate(`/workspace/tasks?taskId=${linkedTask.id}`)}
            title={`View task: ${linkedTask.title}`}
          >
            <CheckSquare size={14} strokeWidth={1.75} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <span className="msg-task-badge-code">{linkedTask.code}</span>
            <span className="msg-task-badge-title">
              {linkedTask.title.length > 40 ? `${linkedTask.title.slice(0, 40)}…` : linkedTask.title}
            </span>
          </div>
        )}

        {/* Reactions */}
        {Object.values(reactionMap).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
            {Object.values(reactionMap).map(r => (
              <button
                key={r.emoji}
                className={`chat-reaction${r.mine ? ' mine' : ''}`}
                onClick={() => onReact(msg.id, r.emoji)}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action toolbar (on hover) */}
      {hovered && (
        <div className="chat-message-actions">
          {/* Create Task button (always visible) */}
          <button
            className="chat-action-btn"
            onClick={() => onCreateTask(msg)}
            title="Create task from message"
          >
            <CheckSquare size={13} strokeWidth={1.75} />
          </button>

          {/* Emoji picker */}
          <div style={{ position: 'relative' }}>
            <button className="chat-action-btn" onClick={() => setEmojiOpen(o => !o)} title="React">
              <Smile size={13} strokeWidth={1.75} />
            </button>
            {emojiOpen && (
              <div className="chat-emoji-picker">
                {QUICK_EMOJIS.map(e => (
                  <button key={e} className="chat-emoji-btn"
                    onClick={() => { onReact(msg.id, e); setEmojiOpen(false) }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isMine && (
            <>
              <button className="chat-action-btn" onClick={() => onEdit(msg.id, msg.content)} title="Edit">
                <Edit3 size={13} strokeWidth={1.75} />
              </button>
              <button className="chat-action-btn danger" onClick={() => onDelete(msg.id)} title="Delete">
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Channel Modal
// ---------------------------------------------------------------------------

function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Channel) => void }) {
  const createChannel = useChatStore((s) => s.createChannel)
  const [name,  setName]  = useState('')
  const [desc,  setDesc]  = useState('')
  const [type,  setType]  = useState<'PUBLIC'|'PRIVATE'>('PUBLIC')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])

  const submit = async () => {
    if (!name.trim()) { setError('Channel name is required'); return }
    setLoading(true); setError(null)
    try {
      const ch = await createChannel({ name: name.trim().toLowerCase().replace(/\s+/g, '-'), description: desc || undefined, type })
      onCreated(ch); onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create channel')
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300, backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="modal" role="dialog" style={{ zIndex: 301, maxWidth: '26rem' }}>
        <div className="modal-header">
          <span className="modal-title">New Channel</span>
          <button className="modal-close" onClick={onClose}><X size={14} strokeWidth={2} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {(['PUBLIC','PRIVATE'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '0.4375rem', borderRadius: '0.375rem', border: `1px solid ${type === t ? 'var(--accent-brand)' : 'var(--border-zone)'}`,
                background: type === t ? 'var(--accent-ghost)' : 'var(--surface-1)',
                color: type === t ? 'var(--accent-brand)' : 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              }}>
                <ChannelIcon type={t} size={11} />
                {t === 'PUBLIC' ? 'Public' : 'Private'}
              </button>
            ))}
          </div>
          <input ref={ref} className="modal-input" placeholder="channel-name" value={name}
            onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <textarea className="modal-textarea" placeholder="Description (optional)" value={desc}
            onChange={e => setDesc(e.target.value)} rows={2} />
          {error && <p style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={13} strokeWidth={2.5} />}
            Create
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Create Direct Message Modal
// ---------------------------------------------------------------------------

function CreateDMModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Channel) => void }) {
  const user = useAuthStore((s) => s.user)
  const createDM = useChatStore((s) => s.createDM)
  const [members, setMembers] = useState<{ id: string; displayName: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 50)
    const wsId = useAuthStore.getState().tenant?.workspaceId
    if (!wsId) {
      setLoading(false)
      return
    }
    workspaceSettingsApi.getMembers(wsId)
      .then(list => {
        setMembers(list.filter(m => m.id !== user?.id))
      })
      .catch(() => setError('Failed to load workspace members'))
      .finally(() => setLoading(false))
  }, [user?.id])

  const startDM = async (targetUserId: string) => {
    setSubmitting(true)
    setError(null)
    try {
      const dm = await createDM(targetUserId)
      onCreated(dm)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to start direct message')
      setSubmitting(false)
    }
  }

  const filteredMembers = members.filter(m =>
    !search ||
    m.displayName.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  )


  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300, backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="modal" role="dialog" aria-label="New Direct Message" style={{ zIndex: 301, maxWidth: '26rem' }}>
        <div className="modal-header">
          <span className="modal-title">New Direct Message</span>
          <button className="modal-close" onClick={onClose}><X size={14} strokeWidth={2} /></button>
        </div>
        <div className="modal-body">
          <input
            ref={ref}
            className="modal-input"
            placeholder="Search team members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {error && <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '0.5rem' }}>{error}</p>}
          <div style={{ maxHeight: '14rem', overflowY: 'auto', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-tertiary)' }} />
              </div>
            )}
            {!loading && filteredMembers.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-disabled)', textAlign: 'center', padding: '1rem 0' }}>
                {search ? 'No team members found' : 'No other team members in workspace'}
              </p>
            )}
            {!loading && filteredMembers.map(m => (
              <button
                key={m.id}
                onClick={() => startDM(m.id)}
                disabled={submitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--surface-1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-1)')}
              >
                <Avatar name={m.displayName} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{m.displayName}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{m.email}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Create Task From Message Modal
// ---------------------------------------------------------------------------

interface MsgToTaskModalProps {
  message: ChatMessage
  onClose: () => void
  onCreated: (task: Task) => void
}

function MsgToTaskModal({ message, onClose, onCreated }: MsgToTaskModalProps) {
  const projects = useTaskStore((s) => s.projects)
  const fetchProjects = useTaskStore((s) => s.fetchProjects)
  const columns = useTaskStore((s) => s.columns)
  const activeProjectId = useTaskStore((s) => s.activeProjectId)
  const createTask = useTaskStore((s) => s.createTask)

  const [title, setTitle] = useState(
    message.content ? message.content.slice(0, 80).replace(/[\r\n]+/g, ' ') : ''
  )
  const [description, setDescription] = useState(
    `From @${message.author.displayName} in chat:\n\n> ${message.content}`
  )
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '')
  const [status, setStatus] = useState<TaskStatus>('TODO')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
    if (projects.length === 0) {
      fetchProjects()
    }
  }, [projects.length, fetchProjects])

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projects, projectId])

  const submit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Task title is required')
      return
    }
    if (!projectId) {
      setError('Please select a project')
      return
    }

    setLoading(true)
    setError(null)

    try {
      let columnId: string | undefined
      if (activeProjectId === projectId && columns.length > 0) {
        columnId = columns[0].id
      } else {
        const projDetail = await projectsApi.getOne(projectId).catch(() => null)
        const firstBoard = projDetail?.boards?.[0]
        if (firstBoard) {
          if (firstBoard.columns && firstBoard.columns.length > 0) {
            columnId = firstBoard.columns[0].id
          } else {
            const cols = await boardsApi.listColumns(firstBoard.id).catch(() => [])
            columnId = cols[0]?.id
          }
        }
      }

      if (!columnId) {
        setError('Selected project has no board columns. Please configure columns in Tasks first.')
        setLoading(false)
        return
      }

      const created = await createTask({
        projectId,
        columnId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        priority,
        status,
      })

      onCreated(created)
      onClose()
    } catch (e: any) {
      const errorMsg =
        e?.response?.data?.error?.formErrors?.[0] ||
        e?.response?.data?.error ||
        e?.message ||
        'Failed to create task'
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg))
      setLoading(false)
    }
  }

  const formattedDate = new Date(message.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--surface-overlay)',
          zIndex: 300,
          backdropFilter: 'blur(3px)',
        }}
        onClick={onClose}
      />
      <div
        className="modal"
        role="dialog"
        aria-label="Create Task from Message"
        style={{ zIndex: 301, maxWidth: '28rem' }}
      >
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4375rem' }}>
            <CheckSquare size={15} strokeWidth={2} style={{ color: 'var(--accent-brand)' }} />
            Create Task from Message
          </span>
          <button className="modal-close" onClick={onClose}><X size={14} strokeWidth={2} /></button>
        </div>
        <div className="modal-body">
          {/* Section A — Quoted message (read-only) */}
          <div className="msg-task-quote">
            <div className="msg-task-quote-author">
              From @{message.author.displayName} · {formattedDate}
            </div>
            <div className="msg-task-quote-content">
              "{message.content}"
            </div>
          </div>

          {/* Section B — Task form fields */}
          <div className="modal-field">
            <label className="modal-label">Title</label>
            <input
              ref={inputRef}
              className="modal-input"
              placeholder="Task title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Description</label>
            <textarea
              className="modal-textarea"
              placeholder="Task description…"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <label className="modal-label">Project</label>
            <select
              className="modal-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.length === 0 ? (
                <option value="" disabled>Loading projects…</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="modal-row">
            <div className="modal-field">
              <label className="modal-label">Status</label>
              <select
                className="modal-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Priority</label>
              <select
                className="modal-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: '0.75rem', color: 'var(--error)', margin: '0.25rem 0 0' }}>
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={submit}
            disabled={loading || !title.trim() || !projectId}
          >
            {loading ? (
              <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <Plus size={13} strokeWidth={2.5} />
            )}
            Create Task
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Message Input
// ---------------------------------------------------------------------------

function MessageInput({ channelId, channelName }: { channelId: string; channelName: string }) {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTyping = () => {
    messagesApi.typingStart(channelId)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => messagesApi.typingStop(channelId), 2000)
  }

  const submit = async () => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')
    try {
      await sendMessage(channelId, content)
    } catch { setText(content) }
    finally { setSending(false) }
    textareaRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-box">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={`Message #${channelName}`}
          value={text}
          onChange={e => { setText(e.target.value); handleTyping() }}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button
          className="chat-send-btn"
          onClick={submit}
          disabled={!text.trim() || sending}
          title="Send (Enter)"
        >
          {sending
            ? <Loader2 size={15} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Send size={15} strokeWidth={2} />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message thread
// ---------------------------------------------------------------------------

const EMPTY_MSGS: ChatMessage[] = []

function isContinuation(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev) return false
  if (prev.authorId !== curr.authorId) return false
  const prevTime = new Date(prev.createdAt).getTime()
  const currTime = new Date(curr.createdAt).getTime()
  return currTime - prevTime < 2 * 60 * 1000 // 2 minutes in ms
}

function MessageThread({
  channelId,
  onCreateTask,
  linkedTasksByMsgId,
}: {
  channelId: string
  onCreateTask: (msg: ChatMessage) => void
  linkedTasksByMsgId: Record<string, { id: string; title: string; code: string }>
}) {
  const msgs = useChatStore((s) => s.messagesByChannel[channelId] ?? EMPTY_MSGS)
  const messagesLoading = useChatStore((s) => s.messagesLoading)
  const editMessage = useChatStore((s) => s.editMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const toggleReaction = useChatStore((s) => s.toggleReaction)
  const user = useAuthStore((s) => s.user)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText,  setEditText]  = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  // Group by date
  const grouped: { date: string; messages: ChatMessage[] }[] = []
  for (const msg of msgs) {
    const date = formatDate(msg.createdAt)
    const last = grouped[grouped.length - 1]
    if (last?.date === date) last.messages.push(msg)
    else grouped.push({ date, messages: [msg] })
  }

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditText(content) }
  const cancelEdit = () => { setEditingId(null); setEditText('') }
  const saveEdit = async (id: string) => {
    if (!editText.trim()) return
    await editMessage(id, channelId, editText.trim())
    cancelEdit()
  }

  if (messagesLoading && msgs.length === 0) return (
    <div className="chat-thread-empty">
      <Loader2 size={20} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-tertiary)' }} />
    </div>
  )

  if (msgs.length === 0) return (
    <div className="chat-thread-empty">
      <MessageSquare size={28} strokeWidth={1.25} style={{ color: 'var(--text-disabled)', marginBottom: '0.5rem' }} />
      <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', margin: 0 }}>
        No messages yet. Start the conversation!
      </p>
    </div>
  )

  return (
    <div className="chat-thread">
      {grouped.map(group => (
        <div key={group.date}>
          <div className="chat-date-divider"><span>{group.date}</span></div>
          {group.messages.map((msg, idx) => {
            const prevMsg = idx > 0 ? group.messages[idx - 1] : undefined
            const continued = isContinuation(prevMsg, msg)

            return editingId === msg.id ? (
              <div key={msg.id} className="chat-message">
                <Avatar name={msg.author.displayName} size={28} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <textarea
                    className="chat-edit-input"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id) }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    autoFocus
                    rows={2}
                  />
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button className="modal-btn secondary" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }} onClick={cancelEdit}>Cancel</button>
                    <button className="modal-btn primary" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }} onClick={() => saveEdit(msg.id)}>Save</button>
                  </div>
                </div>
              </div>
            ) : (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.authorId === user?.id}
                isContinued={continued}
                onEdit={startEdit}
                onDelete={(id) => deleteMessage(id, channelId)}
                onReact={(id, emoji) => toggleReaction(id, channelId, emoji)}
                onCreateTask={onCreateTask}
                linkedTask={linkedTasksByMsgId[msg.id]}
              />
            )
          })}
        </div>
      ))}
      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPage
// ---------------------------------------------------------------------------

export function ChatPage() {
  const channels = useChatStore((s) => s.channels)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const connectRealtime = useChatStore((s) => s.connectRealtime)
  const typingUsers = useChatStore((s) => s.typingUsers)
  const showCreateChannel = useChatStore((s) => s.showCreateChannel)
  const setShowCreateChannel = useChatStore((s) => s.setShowCreateChannel)
  const user = useAuthStore((s) => s.user)
  const setLabel = useBreadcrumbStore((s) => s.setLabel)
  const projects = useTaskStore((s) => s.projects)
  const setActiveProject = useTaskStore((s) => s.setActiveProject)
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  const channelParam = searchParams.get('channel')
  const actionParam = searchParams.get('action')

  const [showCreateDM, setShowCreateDM] = useState(false)
  const [msgToTaskSource, setMsgToTaskSource] = useState<ChatMessage | null>(null)
  const [linkedTasksByMsgId, setLinkedTasksByMsgId] = useState<
    Record<string, { id: string; title: string; code: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('syncra_chat_linked_tasks')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('syncra_chat_linked_tasks', JSON.stringify(linkedTasksByMsgId))
    } catch {}
  }, [linkedTasksByMsgId])

  // Connect socket and register listeners once on mount
  useEffect(() => {
    connectRealtime()
    return () => setLabel(null)
  }, [connectRealtime, setLabel])

  // Auto-select first channel or channel from URL param
  useEffect(() => {
    if (channelParam && channels.some((c) => c.id === channelParam)) {
      if (activeChannelId !== channelParam) {
        setActiveChannel(channelParam)
      }
      return
    }
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannel(channels[0].id)
    }
  }, [channelParam, channels, activeChannelId, setActiveChannel])

  // Handle action search params (+ triggers from sidebar)
  useEffect(() => {
    if (actionParam === 'new-channel') {
      setShowCreateChannel(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('action')
        return next
      }, { replace: true })
    } else if (actionParam === 'new-dm') {
      setShowCreateDM(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('action')
        return next
      }, { replace: true })
    }
  }, [actionParam, setSearchParams, setShowCreateChannel])

  // Push active channel name into breadcrumb store
  useEffect(() => {
    if (!activeChannelId) { setLabel(null); return }
    const ch = channels.find((c) => c.id === activeChannelId)
    if (!ch) return
    const name = ch.type === 'DIRECT'
      ? ch.members.find((m) => m.user.id !== user?.id)?.user.displayName ?? 'DM'
      : `#${ch.name}`
    setLabel(name)
  }, [activeChannelId, channels, user?.id, setLabel])

  const activeChannel = channels.find(c => c.id === activeChannelId)

  const activeChannelName = activeChannel?.type === 'DIRECT'
    ? activeChannel.members.find(m => m.user.id !== user?.id)?.user.displayName ?? 'Direct Message'
    : activeChannel?.name ?? 'channel'

  const typingList = activeChannelId ? (typingUsers[activeChannelId] ?? []) : []

  // ── Cross-link: find the project matching the active channel by name ──
  const handleViewTasks = async () => {
    if (activeChannel && activeChannel.type !== 'DIRECT' && activeChannel.name) {
      const chName = activeChannel.name.toLowerCase()
      const match = projects.find(p =>
        p.name.trim().toLowerCase() === chName ||
        p.name.trim().toLowerCase().replace(/\s+/g, '-') === chName
      )
      if (match) {
        await setActiveProject(match.id)
        navigate(`/workspace/tasks?subview=board`)
        return
      }
    }
    navigate('/workspace/tasks')
  }

  return (
    <div className="chat-page">
      {/* ── Main area (fills full workspace shell) ── */}
      {activeChannel ? (
        <div className="chat-main">
          {/* Header */}
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>
                <ChannelIcon type={activeChannel.type} size={15} />
              </span>
              <span className="chat-header-name">
                {activeChannel.type !== 'DIRECT'
                  ? (activeChannelName.startsWith('#') ? activeChannelName : `#${activeChannelName}`)
                  : activeChannelName}
              </span>
              {activeChannel.description && (
                <>
                  <span style={{ color: 'var(--border-strong)', fontSize: '0.75rem' }}>·</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {activeChannel.description}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Users size={12} strokeWidth={1.75} /> {activeChannel.members.length}
              </span>
              {/* View Tasks cross-link — only for non-DM channels */}
              {activeChannel.type !== 'DIRECT' && (
                <button
                  onClick={handleViewTasks}
                  title="View related project in Tasks"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3125rem',
                    padding: '0.25rem 0.5625rem',
                    fontSize: '0.75rem', fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    transition: 'color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-brand)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-brand)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)' }}
                >
                  <CheckSquare size={12} strokeWidth={1.75} />
                  <span>View Tasks</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <MessageThread
            channelId={activeChannel.id}
            onCreateTask={(m) => setMsgToTaskSource(m)}
            linkedTasksByMsgId={linkedTasksByMsgId}
          />

          {/* Typing indicator */}
          {typingList.length > 0 && (
            <div className="chat-typing">
              <span className="chat-typing-dots"><span/><span/><span/></span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {typingList.length === 1
                  ? `${typingList[0]} is typing…`
                  : `${typingList.join(', ')} are typing…`}
              </span>
            </div>
          )}

          {/* Input */}
          <MessageInput channelId={activeChannel.id} channelName={activeChannelName} />
        </div>
      ) : (
        <div className="chat-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem' }}>
          <MessageSquare size={32} strokeWidth={1.25} style={{ color: 'var(--text-disabled)' }} />
          <p style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>
            Select a channel to start chatting
          </p>
          <button className="modal-btn primary" onClick={() => setShowCreateChannel(true)}>
            <Plus size={13} strokeWidth={2.5} /> New Channel
          </button>
        </div>
      )}

      {/* Create channel modal */}
      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreated={(ch) => setActiveChannel(ch.id)}
        />
      )}

      {/* Create DM modal */}
      {showCreateDM && (
        <CreateDMModal
          onClose={() => setShowCreateDM(false)}
          onCreated={(dm) => setActiveChannel(dm.id)}
        />
      )}

      {/* Create task from message modal */}
      {msgToTaskSource && (
        <MsgToTaskModal
          message={msgToTaskSource}
          onClose={() => setMsgToTaskSource(null)}
          onCreated={(task) => {
            setLinkedTasksByMsgId((prev) => ({
              ...prev,
              [msgToTaskSource.id]: {
                id: task.id,
                title: task.title,
                code: `SYN-${task.id.slice(-6).toUpperCase()}`,
              },
            }))
            setMsgToTaskSource(null)
          }}
        />
      )}
    </div>
  )
}
