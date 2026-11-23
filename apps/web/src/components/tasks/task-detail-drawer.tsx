/**
 * TaskDetailDrawer — Rich two-pane task command center (ClickUp / Linear style).
 *
 * LEFT PANE (65%)  : Prominent editable H1 title · Quick-select properties grid
 *                    (Status dropdown, Priority flag pill, Assignee member picker, Due Date) ·
 *                    Description editor · Subtasks checklist with progress bar.
 * RIGHT PANE (35%) : Activity & Comments stream (chronological comments & system logs) ·
 *                    Bottom comment input box with optimistic updates.
 *
 * URL Sync: ?taskId=<id> opens the drawer; closing clears the query param.
 * Keyboard: Esc dismisses popups or closes the drawer.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Copy, Check, Circle, Clock, CheckCircle2, AlertCircle,
  ArrowUp, Minus, Calendar, Plus, Trash2, Send, ChevronDown,
  User, Flag, Tag, UserPlus,
} from 'lucide-react'
import { useTaskStore, type TaskSubtask, type TaskComment } from '@/stores/task-store'
import { useAuthStore } from '@/stores/auth-store'
import { workspaceSettingsApi, type WorkspaceMember } from '@/lib/settings-api'
import { getTagColor, getTaskTags, parseTags, type Task, type TaskPriority, type TaskStatus } from '@/types'

// ---------------------------------------------------------------------------
// Helpers to read storage without calling Zustand set during render
// ---------------------------------------------------------------------------

function getInitialSubtasks(taskId: string): TaskSubtask[] {
  try {
    const raw = localStorage.getItem(`task_subtasks_${taskId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function getInitialComments(
  taskId: string,
  initialSysComment?: { authorId: string; authorName: string; createdAt: string }
): TaskComment[] {
  try {
    const raw = localStorage.getItem(`task_comments_${taskId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  if (initialSysComment) {
    return [
      {
        id: 'sys-init',
        authorId: initialSysComment.authorId,
        authorName: initialSysComment.authorName,
        content: 'created this task',
        createdAt: initialSysComment.createdAt,
        isSystem: true,
      },
    ]
  }
  return []
}

// ---------------------------------------------------------------------------
// Constants & Configurations
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  TODO:        { label: 'To Do',       color: 'var(--text-tertiary)',  icon: Circle,       bg: 'var(--surface-active)' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--accent-brand)',   icon: Clock,        bg: 'var(--accent-ghost)' },
  IN_REVIEW:   { label: 'In Review',   color: 'var(--warning)',        icon: AlertCircle,  bg: 'rgba(245,158,11,0.1)' },
  DONE:        { label: 'Done',        color: 'var(--success)',        icon: CheckCircle2, bg: 'rgba(34,197,94,0.1)' },
  CANCELLED:   { label: 'Cancelled',   color: 'var(--text-disabled)',  icon: X,            bg: 'var(--surface-hover)' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: React.ElementType; flagEmoji: string }> = {
  URGENT: { label: 'Urgent', color: 'var(--error)',           icon: AlertCircle, flagEmoji: '🔴' },
  HIGH:   { label: 'High',   color: 'var(--priority-high)',   icon: ArrowUp,     flagEmoji: '🟠' },
  MEDIUM: { label: 'Medium', color: 'var(--priority-medium)', icon: Minus,       flagEmoji: '🟡' },
  LOW:    { label: 'Low',    color: 'var(--priority-low)',    icon: Flag,        flagEmoji: '⚪' },
}

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']
const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDue(dateStr: string): { label: string; urgent: boolean } {
  const d = new Date(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  if (d < todayStart) return { label: `Overdue · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, urgent: true }
  if (d <= todayEnd) return { label: 'Due Today', urgent: true }
  const diff = Math.ceil((d.getTime() - todayEnd.getTime()) / 86400000)
  if (diff === 1) return { label: 'Tomorrow', urgent: false }
  if (diff <= 6) return { label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), urgent: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false }
}

function getInitials(name: string): string {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// ---------------------------------------------------------------------------
// Avatar Component
// ---------------------------------------------------------------------------

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const safeName = name || 'User'
  const hue = safeName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `oklch(0.68 0.18 ${hue})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(9, size * 0.38),
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '-0.01em',
        boxShadow: '0 0 0 1px var(--border-subtle)',
      }}
    >
      {getInitials(safeName)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskDetailDrawerProps {
  task: Task
  projectName: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TaskDetailDrawer({ task, projectName, onClose }: TaskDetailDrawerProps) {
  const currentUser = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)

  const {
    updateTask,
    deleteTask,
    getSubtasks,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    getComments,
    addComment,
  } = useTaskStore()

  // ── Editable fields ───────────────────────────────────────────────────
  const [title, setTitle] = useState(task.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLTextAreaElement>(null)

  const [description, setDescription] = useState(task.description ?? '')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descSaving, setDescSaving] = useState(false)

  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [dueDate, setDueDate] = useState<string>(task.dueDate ?? '')
  const [assignee, setAssignee] = useState(task.assignee ?? null)

  // ── Dropdown states ───────────────────────────────────────────────────
  const [statusOpen, setStatusOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

  // ── Workspace members for Assignee picker ──────────────────────────────
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  // ── Subtasks state (safe local storage read on mount — no store mutation during render) ──
  const [subtasks, setSubtasksState] = useState<TaskSubtask[]>(() => getInitialSubtasks(task.id))
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  // ── Comments state (safe local storage read on mount — no store mutation during render) ──
  const [comments, setCommentsState] = useState<TaskComment[]>(() =>
    getInitialComments(task.id, {
      authorId: task.reporterId,
      authorName: task.reporter?.displayName ?? 'Team member',
      createdAt: task.createdAt,
    })
  )
  const [commentInput, setCommentInput] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const commentsBottomRef = useRef<HTMLDivElement>(null)

  // ── Tags & Labels state ───────────────────────────────────────────────
  const [tags, setTags] = useState<string[]>(() => {
    const parsed = parseTags(task.labels)
    return parsed.length > 0 ? parsed : getTaskTags(task)
  })
  const [customTagInput, setCustomTagInput] = useState('')
  const customTagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tagsOpen) {
      setTimeout(() => customTagInputRef.current?.focus(), 50)
    }
  }, [tagsOpen])

  // ── Copy link state ───────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)

  // ── Derived values ────────────────────────────────────────────────────
  const taskId = task.id
  const taskCode = `SYN-${taskId.slice(-6).toUpperCase()}`
  const completedSubtasks = subtasks.filter((s) => s.done).length
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0

  // ── Fetch workspace members for member picker ─────────────────────────
  useEffect(() => {
    let isMounted = true
    if (tenant?.workspaceId) {
      setMembersLoading(true)
      workspaceSettingsApi
        .getMembers(tenant.workspaceId)
        .then((data) => {
          if (isMounted) setMembers(data)
        })
        .catch(() => {
          // fallback with current user and assignee
          if (isMounted && currentUser) {
            setMembers([
              {
                id: currentUser.id,
                email: currentUser.email,
                displayName: currentUser.displayName,
                role: 'MEMBER',
                joinedAt: new Date().toISOString(),
              },
            ])
          }
        })
        .finally(() => {
          if (isMounted) setMembersLoading(false)
        })
    }
    return () => {
      isMounted = false
    }
  }, [tenant?.workspaceId, currentUser])

  // ── Sync when task prop updates (runs safely inside useEffect) ─────────
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setStatus(task.status)
    setPriority(task.priority)
    setDueDate(task.dueDate ?? '')
    setAssignee(task.assignee ?? null)
    const parsed = parseTags(task.labels)
    setTags(parsed.length > 0 ? parsed : getTaskTags(task))
    setSubtasksState(getSubtasks(task.id))
    setCommentsState(
      getComments(task.id, {
        authorId: task.reporterId,
        authorName: task.reporter?.displayName ?? 'Team member',
        createdAt: task.createdAt,
      })
    )
  }, [task.id, task.updatedAt, task.labels, getSubtasks, getComments])

  // ── Close popovers on outside click ──────────────────────────────────
  useEffect(() => {
    if (!statusOpen && !priorityOpen && !assigneeOpen && !dueDateOpen && !tagsOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        !target.closest('.tdd-dropdown') &&
        !target.closest('.tdd-pill-btn') &&
        !target.closest('.tdd-add-tag-btn')
      ) {
        setStatusOpen(false)
        setPriorityOpen(false)
        setAssigneeOpen(false)
        setDueDateOpen(false)
        setTagsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [statusOpen, priorityOpen, assigneeOpen, dueDateOpen, tagsOpen])

  // ── Esc key dismisses open popover or closes drawer ───────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (statusOpen || priorityOpen || assigneeOpen || dueDateOpen || tagsOpen) {
          setStatusOpen(false)
          setPriorityOpen(false)
          setAssigneeOpen(false)
          setDueDateOpen(false)
          setTagsOpen(false)
        } else if (editingTitle) {
          setTitle(task.title)
          setEditingTitle(false)
        } else if (editingDesc) {
          setDescription(task.description ?? '')
          setEditingDesc(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [statusOpen, priorityOpen, assigneeOpen, dueDateOpen, tagsOpen, editingTitle, editingDesc, onClose, task])

  // ── Auto-scroll comments to bottom on new item ────────────────────────
  useEffect(() => {
    commentsBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleAddTag = async (tagName: string) => {
    const clean = tagName.trim()
    if (!clean) return
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setCustomTagInput('')
      return
    }
    const nextTags = [...tags, clean]
    setTags(nextTags)
    setCustomTagInput('')
    setTagsOpen(false)
    const labelsStr = JSON.stringify(nextTags)
    await updateTask(taskId, { labels: labelsStr })
    const entry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: `added tag "${clean}"`,
      isSystem: true,
    })
    setCommentsState((prev) => [...prev, entry])
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove)
    setTags(nextTags)
    const labelsStr = JSON.stringify(nextTags)
    await updateTask(taskId, { labels: labelsStr })
    const entry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: `removed tag "${tagToRemove}"`,
      isSystem: true,
    })
    setCommentsState((prev) => [...prev, entry])
  }

  const handleTitleSave = useCallback(async () => {
    setEditingTitle(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      await updateTask(taskId, { title: trimmed })
    } else if (!trimmed) {
      setTitle(task.title)
    }
  }, [title, task.title, taskId, updateTask])

  const handleDescSave = useCallback(async () => {
    setEditingDesc(false)
    const cleanDesc = description.trim()
    if (cleanDesc !== (task.description ?? '').trim()) {
      setDescSaving(true)
      try {
        await updateTask(taskId, { description: cleanDesc || undefined })
      } finally {
        setDescSaving(false)
      }
    }
  }, [description, task.description, taskId, updateTask])

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setStatus(newStatus)
    setStatusOpen(false)
    await updateTask(taskId, { status: newStatus })
    const entry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: `changed status to ${STATUS_CONFIG[newStatus].label}`,
      isSystem: true,
    })
    setCommentsState((prev) => [...prev, entry])
  }

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    setPriority(newPriority)
    setPriorityOpen(false)
    await updateTask(taskId, { priority: newPriority })
    const entry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: `changed priority to ${PRIORITY_CONFIG[newPriority].label}`,
      isSystem: true,
    })
    setCommentsState((prev) => [...prev, entry])
  }

  const handleAssigneeChange = async (member: WorkspaceMember | null) => {
    setAssigneeOpen(false)
    if (member) {
      setAssignee({ id: member.id, displayName: member.displayName, avatarUrl: member.avatarUrl })
      await updateTask(taskId, { assigneeId: member.id })
      const entry = addComment(taskId, {
        authorId: currentUser?.id ?? '',
        authorName: currentUser?.displayName ?? 'You',
        content: `assigned to ${member.displayName}`,
        isSystem: true,
      })
      setCommentsState((prev) => [...prev, entry])
    } else {
      setAssignee(null)
      await updateTask(taskId, { assigneeId: null })
      const entry = addComment(taskId, {
        authorId: currentUser?.id ?? '',
        authorName: currentUser?.displayName ?? 'You',
        content: `unassigned this task`,
        isSystem: true,
      })
      setCommentsState((prev) => [...prev, entry])
    }
  }

  const handleDueDateChange = async (val: string) => {
    setDueDate(val)
    setDueDateOpen(false)
    const iso = val ? new Date(val).toISOString() : null
    await updateTask(taskId, { dueDate: iso })
    const entry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: val
        ? `set due date to ${new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `cleared the due date`,
      isSystem: true,
    })
    setCommentsState((prev) => [...prev, entry])
  }

  const handleSetQuickDueDate = (type: 'today' | 'tomorrow' | 'nextWeek' | 'clear') => {
    if (type === 'clear') {
      handleDueDateChange('')
      return
    }
    const d = new Date()
    if (type === 'tomorrow') d.setDate(d.getDate() + 1)
    if (type === 'nextWeek') d.setDate(d.getDate() + 7)
    const formatted = d.toISOString().split('T')[0]
    handleDueDateChange(formatted)
  }

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return
    const added = addSubtask(taskId, newSubtaskTitle)
    setSubtasksState((prev) => [...prev, added])
    setNewSubtaskTitle('')
  }

  const handleToggleSubtask = (subtaskId: string) => {
    toggleSubtask(taskId, subtaskId)
    setSubtasksState((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s))
    )
  }

  const handleDeleteSubtask = (subtaskId: string) => {
    deleteSubtask(taskId, subtaskId)
    setSubtasksState((prev) => prev.filter((s) => s.id !== subtaskId))
  }

  const handleSendComment = () => {
    if (!commentInput.trim() || sendingComment) return
    const text = commentInput.trim()
    setCommentInput('')
    setSendingComment(true)
    const newEntry = addComment(taskId, {
      authorId: currentUser?.id ?? '',
      authorName: currentUser?.displayName ?? 'You',
      content: text,
      isSystem: false,
    })
    setCommentsState((prev) => [...prev, newEntry])
    setSendingComment(false)
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/workspace/tasks?taskId=${taskId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDeleteTask = async () => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId, task.columnId)
      onClose()
    }
  }

  const dueDateDisplay = dueDate ? formatDue(dueDate) : null
  const dueDateInputVal = dueDate ? new Date(dueDate).toISOString().split('T')[0] : ''

  return (
    <>
      {/* Backdrop */}
      <div className="tdd-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer Container */}
      <aside className="tdd-drawer" role="dialog" aria-label={`Task: ${title}`} aria-modal="true">
        {/* ── TOP NAVIGATION HEADER ── */}
        <header className="tdd-nav-header">
          <div className="tdd-breadcrumb">
            <span className="tdd-breadcrumb-project">{projectName}</span>
            <span className="tdd-breadcrumb-sep">/</span>
            <span className="tdd-breadcrumb-id">{taskCode}</span>
          </div>

          <div className="tdd-nav-actions">
            <button
              type="button"
              className="tdd-action-btn"
              onClick={handleCopyLink}
              title="Copy task link"
              aria-label="Copy task link"
            >
              {copied ? (
                <>
                  <Check size={13} strokeWidth={2.5} style={{ color: 'var(--success)' }} />
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={13} strokeWidth={1.75} />
                  <span>Copy link</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="tdd-icon-btn danger"
              onClick={handleDeleteTask}
              title="Delete task"
              aria-label="Delete task"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>

            <button
              type="button"
              className="tdd-icon-btn"
              onClick={onClose}
              title="Close drawer (Esc)"
              aria-label="Close drawer"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* ── TWO-PANE BODY (65% / 35%) ── */}
        <div className="tdd-body">
          {/* ════════════════════════════════════════════════════════════════
              LEFT PANE (65%): The Work Specification
             ════════════════════════════════════════════════════════════════ */}
          <div className="tdd-left">
            {/* Task Title (Prominent Editable H1) */}
            <div className="tdd-title-container">
              {editingTitle ? (
                <textarea
                  ref={titleInputRef}
                  className="tdd-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      titleInputRef.current?.blur()
                    }
                    if (e.key === 'Escape') {
                      setTitle(task.title)
                      setEditingTitle(false)
                    }
                  }}
                  rows={2}
                  autoFocus
                />
              ) : (
                <h1
                  className="tdd-title-display"
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit title inline"
                >
                  {title}
                </h1>
              )}
            </div>

            {/* Properties Grid (Quick-Select Metadata) */}
            <div className="tdd-props-card">
              {/* Status */}
              <div className="tdd-prop-row">
                <div className="tdd-prop-label">
                  <Circle size={12} strokeWidth={2} />
                  <span>Status</span>
                </div>
                <div className="tdd-prop-control">
                  <button
                    type="button"
                    className="tdd-pill-btn"
                    onClick={() => {
                      setStatusOpen((v) => !v)
                      setPriorityOpen(false)
                      setAssigneeOpen(false)
                      setDueDateOpen(false)
                    }}
                    style={{ color: STATUS_CONFIG[status].color, background: STATUS_CONFIG[status].bg }}
                  >
                    {(() => {
                      const Icon = STATUS_CONFIG[status].icon
                      return <Icon size={12} strokeWidth={2} />
                    })()}
                    <span>{STATUS_CONFIG[status].label}</span>
                    <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.6 }} />
                  </button>

                  {statusOpen && (
                    <div className="tdd-dropdown" onClick={(e) => e.stopPropagation()}>
                      {STATUS_ORDER.map((s) => {
                        const cfg = STATUS_CONFIG[s]
                        const Icon = cfg.icon
                        return (
                          <button
                            key={s}
                            type="button"
                            className={`tdd-dropdown-item${status === s ? ' active' : ''}`}
                            onClick={() => handleStatusChange(s)}
                          >
                            <Icon size={13} strokeWidth={2} style={{ color: cfg.color }} />
                            <span>{cfg.label}</span>
                            {status === s && <Check size={12} strokeWidth={2.5} style={{ marginLeft: 'auto', color: cfg.color }} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Priority */}
              <div className="tdd-prop-row">
                <div className="tdd-prop-label">
                  <Flag size={12} strokeWidth={2} />
                  <span>Priority</span>
                </div>
                <div className="tdd-prop-control">
                  <button
                    type="button"
                    className="tdd-pill-btn"
                    onClick={() => {
                      setPriorityOpen((v) => !v)
                      setStatusOpen(false)
                      setAssigneeOpen(false)
                      setDueDateOpen(false)
                    }}
                    style={{
                      color: PRIORITY_CONFIG[priority].color,
                      background: `${PRIORITY_CONFIG[priority].color}14`,
                    }}
                  >
                    <span>{PRIORITY_CONFIG[priority].flagEmoji}</span>
                    <span>{PRIORITY_CONFIG[priority].label}</span>
                    <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.6 }} />
                  </button>

                  {priorityOpen && (
                    <div className="tdd-dropdown" onClick={(e) => e.stopPropagation()}>
                      {PRIORITY_ORDER.map((p) => {
                        const cfg = PRIORITY_CONFIG[p]
                        return (
                          <button
                            key={p}
                            type="button"
                            className={`tdd-dropdown-item${priority === p ? ' active' : ''}`}
                            onClick={() => handlePriorityChange(p)}
                          >
                            <span>{cfg.flagEmoji}</span>
                            <span style={{ color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                            {priority === p && <Check size={12} strokeWidth={2.5} style={{ marginLeft: 'auto', color: cfg.color }} />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Assignee */}
              <div className="tdd-prop-row">
                <div className="tdd-prop-label">
                  <User size={12} strokeWidth={2} />
                  <span>Assignee</span>
                </div>
                <div className="tdd-prop-control">
                  <button
                    type="button"
                    className="tdd-pill-btn"
                    onClick={() => {
                      setAssigneeOpen((v) => !v)
                      setStatusOpen(false)
                      setPriorityOpen(false)
                      setDueDateOpen(false)
                    }}
                    style={{ background: 'var(--surface-active)' }}
                  >
                    {assignee ? (
                      <>
                        <Avatar name={assignee.displayName} size={18} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {assignee.displayName}
                        </span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Unassigned</span>
                      </>
                    )}
                    <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.6 }} />
                  </button>

                  {assigneeOpen && (
                    <div className="tdd-dropdown" onClick={(e) => e.stopPropagation()} style={{ minWidth: '14rem' }}>
                      <div className="tdd-dropdown-header">Assign to member</div>
                      <button
                        type="button"
                        className={`tdd-dropdown-item${!assignee ? ' active' : ''}`}
                        onClick={() => handleAssigneeChange(null)}
                      >
                        <UserPlus size={13} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)' }} />
                        <span>Unassigned</span>
                        {!assignee && <Check size={12} strokeWidth={2.5} style={{ marginLeft: 'auto', color: 'var(--accent-brand)' }} />}
                      </button>

                      {membersLoading && (
                        <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          Loading members…
                        </div>
                      )}

                      {members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`tdd-dropdown-item${assignee?.id === m.id ? ' active' : ''}`}
                          onClick={() => handleAssigneeChange(m)}
                        >
                          <Avatar name={m.displayName} size={20} />
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.displayName}
                            </span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.email}
                            </span>
                          </div>
                          {assignee?.id === m.id && <Check size={12} strokeWidth={2.5} style={{ marginLeft: 'auto', color: 'var(--accent-brand)' }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Due Date */}
              <div className="tdd-prop-row">
                <div className="tdd-prop-label">
                  <Calendar size={12} strokeWidth={2} />
                  <span>Due Date</span>
                </div>
                <div className="tdd-prop-control">
                  <button
                    type="button"
                    className="tdd-pill-btn"
                    onClick={() => {
                      setDueDateOpen((v) => !v)
                      setStatusOpen(false)
                      setPriorityOpen(false)
                      setAssigneeOpen(false)
                    }}
                    style={{
                      color: dueDateDisplay?.urgent ? 'var(--error)' : dueDateDisplay ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      background: dueDateDisplay?.urgent ? 'rgba(239,68,68,0.1)' : 'var(--surface-active)',
                    }}
                  >
                    <Calendar size={12} strokeWidth={2} />
                    <span>{dueDateDisplay?.label ?? 'Set due date'}</span>
                    <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.6 }} />
                  </button>

                  {dueDateOpen && (
                    <div className="tdd-dropdown date-picker" onClick={(e) => e.stopPropagation()}>
                      <div className="tdd-dropdown-header">Quick Presets</div>
                      <div className="tdd-date-presets">
                        <button type="button" className="tdd-date-preset-btn" onClick={() => handleSetQuickDueDate('today')}>
                          Today
                        </button>
                        <button type="button" className="tdd-date-preset-btn" onClick={() => handleSetQuickDueDate('tomorrow')}>
                          Tomorrow
                        </button>
                        <button type="button" className="tdd-date-preset-btn" onClick={() => handleSetQuickDueDate('nextWeek')}>
                          Next Week
                        </button>
                      </div>

                      <div className="tdd-date-input-wrap">
                        <label className="tdd-date-label">Custom Date</label>
                        <input
                          type="date"
                          className="tdd-date-input"
                          value={dueDateInputVal}
                          onChange={(e) => handleDueDateChange(e.target.value)}
                        />
                      </div>

                      {dueDate && (
                        <button
                          type="button"
                          className="tdd-dropdown-item danger"
                          onClick={() => handleSetQuickDueDate('clear')}
                        >
                          <X size={12} strokeWidth={2} />
                          <span>Clear due date</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="tdd-prop-row tags-row">
                <div className="tdd-prop-label">
                  <Tag size={12} strokeWidth={2} />
                  <span>Tags</span>
                </div>
                <div className="tdd-prop-control tdd-tags-control">
                  <div className="tdd-tags-list">
                    {tags.map((tag) => {
                      const color = getTagColor(tag)
                      return (
                        <span
                          key={tag}
                          className="tdd-tag-chip"
                          style={{
                            backgroundColor: color.bg,
                            color: color.text,
                            borderColor: color.border,
                          }}
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            className="tdd-tag-remove"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveTag(tag)
                            }}
                            title={`Remove tag ${tag}`}
                            aria-label={`Remove tag ${tag}`}
                          >
                            <X size={10} strokeWidth={2.5} />
                          </button>
                        </span>
                      )
                    })}

                    {/* Add Tag Button */}
                    <div className="tdd-add-tag-anchor">
                      <button
                        type="button"
                        className="tdd-add-tag-btn"
                        onClick={() => {
                          setTagsOpen((v) => !v)
                          setStatusOpen(false)
                          setPriorityOpen(false)
                          setAssigneeOpen(false)
                          setDueDateOpen(false)
                        }}
                        title="Add tag"
                      >
                        <Plus size={11} strokeWidth={2.5} />
                        <span>Add Tag</span>
                      </button>

                      {tagsOpen && (
                        <div className="tdd-dropdown tags-picker" onClick={(e) => e.stopPropagation()}>
                          <div className="tdd-dropdown-header">Add or Create Tag</div>

                          {/* Custom tag input */}
                          <div className="tdd-tag-input-wrap">
                            <input
                              ref={customTagInputRef}
                              type="text"
                              className="tdd-tag-input"
                              placeholder="Type tag name and press Enter..."
                              value={customTagInput}
                              onChange={(e) => setCustomTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddTag(customTagInput)
                                }
                              }}
                            />
                          </div>

                          {/* Quick suggestions */}
                          <div className="tdd-dropdown-header" style={{ marginTop: '0.25rem' }}>Quick Suggestions</div>
                          <div className="tdd-tag-suggestions">
                            {['Frontend', 'Backend', 'API', 'Bug', 'Design', 'P0', 'Documentation', 'Refactor'].map((suggested) => {
                              const isAdded = tags.some((t) => t.toLowerCase() === suggested.toLowerCase())
                              const color = getTagColor(suggested)
                              return (
                                <button
                                  key={suggested}
                                  type="button"
                                  className={`tdd-tag-suggestion-chip${isAdded ? ' added' : ''}`}
                                  onClick={() => {
                                    if (!isAdded) handleAddTag(suggested)
                                  }}
                                  disabled={isAdded}
                                  style={{
                                    backgroundColor: isAdded ? 'var(--surface-hover)' : color.bg,
                                    color: isAdded ? 'var(--text-disabled)' : color.text,
                                    borderColor: isAdded ? 'var(--border-subtle)' : color.border,
                                  }}
                                >
                                  <span>{suggested}</span>
                                  {isAdded && <Check size={9} strokeWidth={2.5} />}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Task Description */}
            <section className="tdd-section" aria-label="Task Description">
              <div className="tdd-section-header">
                <span className="tdd-section-title">Description</span>
                {descSaving && <span className="tdd-section-badge">Saving…</span>}
              </div>

              {editingDesc ? (
                <div className="tdd-desc-editor-wrap">
                  <textarea
                    className="tdd-desc-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescSave}
                    placeholder="Add a detailed description, specifications, or notes..."
                    rows={6}
                    autoFocus
                  />
                  <div className="tdd-desc-actions">
                    <button
                      type="button"
                      className="tdd-desc-btn secondary"
                      onClick={() => {
                        setDescription(task.description ?? '')
                        setEditingDesc(false)
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="tdd-desc-btn primary"
                      onClick={handleDescSave}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`tdd-desc-preview${!description ? ' placeholder' : ''}`}
                  onClick={() => setEditingDesc(true)}
                  title="Click to edit description"
                >
                  {description || 'Add a detailed description, specifications, or notes...'}
                </div>
              )}
            </section>

            {/* Subtasks Checklist */}
            <section className="tdd-section" aria-label="Subtasks Checklist">
              <div className="tdd-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="tdd-section-title">Subtasks</span>
                  {subtasks.length > 0 && (
                    <span className="tdd-subtask-badge">
                      {completedSubtasks} of {subtasks.length} completed
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {subtasks.length > 0 && (
                <div className="tdd-progress-bar-track">
                  <div
                    className="tdd-progress-bar-fill"
                    style={{
                      width: `${subtaskProgress}%`,
                      background: subtaskProgress === 100 ? 'var(--success)' : 'var(--accent-brand)',
                    }}
                  />
                </div>
              )}

              {/* Checklist items */}
              <div className="tdd-subtasks-list">
                {subtasks.map((st) => (
                  <div key={st.id} className="tdd-subtask-row">
                    <button
                      type="button"
                      className={`tdd-subtask-checkbox${st.done ? ' checked' : ''}`}
                      onClick={() => handleToggleSubtask(st.id)}
                      aria-label={st.done ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {st.done && <Check size={10} strokeWidth={3} />}
                    </button>

                    <span className={`tdd-subtask-label${st.done ? ' completed' : ''}`}>
                      {st.title}
                    </span>

                    <button
                      type="button"
                      className="tdd-subtask-delete-btn"
                      onClick={() => handleDeleteSubtask(st.id)}
                      title="Delete subtask"
                      aria-label="Delete subtask"
                    >
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}

                {/* Inline add subtask input */}
                <div className="tdd-subtask-add-row">
                  <Plus size={13} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <input
                    type="text"
                    className="tdd-subtask-input"
                    placeholder="+ Add subtask (press Enter)"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddSubtask()
                      }
                    }}
                  />
                  {newSubtaskTitle.trim() && (
                    <button
                      type="button"
                      className="tdd-subtask-add-btn"
                      onClick={handleAddSubtask}
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              RIGHT PANE (35%): Activity & Discussion
             ════════════════════════════════════════════════════════════════ */}
          <div className="tdd-right">
            {/* Section Header */}
            <div className="tdd-right-header">
              <span className="tdd-section-title">Activity & Comments</span>
            </div>

            {/* Comment Thread & Activity Log */}
            <div className="tdd-comments-stream">
              {comments.map((entry) =>
                entry.isSystem ? (
                  <div key={entry.id} className="tdd-activity-row">
                    <div className="tdd-activity-dot" />
                    <div className="tdd-activity-content">
                      <span className="tdd-activity-author">{entry.authorName}</span>
                      <span className="tdd-activity-text">{entry.content}</span>
                      <span className="tdd-activity-time">{formatRelTime(entry.createdAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div key={entry.id} className="tdd-comment-row">
                    <Avatar name={entry.authorName} size={28} />
                    <div className="tdd-comment-card">
                      <div className="tdd-comment-meta">
                        <span className="tdd-comment-author">{entry.authorName}</span>
                        <span className="tdd-comment-time">{formatRelTime(entry.createdAt)}</span>
                      </div>
                      <div className="tdd-comment-body">{entry.content}</div>
                    </div>
                  </div>
                )
              )}
              <div ref={commentsBottomRef} />
            </div>

            {/* Comment Input Box (Bottom) */}
            <div className="tdd-comment-input-area">
              <div className="tdd-comment-box">
                <textarea
                  className="tdd-comment-textarea"
                  placeholder="Write a comment or update..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendComment()
                    }
                  }}
                  rows={2}
                />
                <div className="tdd-comment-box-footer">
                  <span className="tdd-comment-hint">Press ↵ Enter to send</span>
                  <button
                    type="button"
                    className="tdd-comment-send-btn"
                    onClick={handleSendComment}
                    disabled={!commentInput.trim() || sendingComment}
                    title="Send comment"
                  >
                    <Send size={12} strokeWidth={2} />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
