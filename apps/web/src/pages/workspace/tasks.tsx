import { useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Plus, List, LayoutGrid, ChevronDown, ChevronRight, X, Circle,
  AlertCircle, ArrowUp, Minus, CheckCircle2, Clock,
  MoreHorizontal, Loader2, FolderOpen, MessageSquare,
  Search, SlidersHorizontal, ArrowUpDown, RotateCcw, Check, Flag,
  Calendar, CheckSquare, Tag, Database,
} from 'lucide-react'
import { useTaskStore } from '@/stores/task-store'
import { useChatStore } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'
import { workspaceSettingsApi, type WorkspaceMember } from '@/lib/settings-api'
import { TaskDetailDrawer } from '@/components/tasks/task-detail-drawer'
import { getTagColor, getTaskTags, parseTags, type Task, type TaskPriority, type TaskStatus, type Column } from '@/types'
import { runSeedData } from '@/lib/seed-data'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SortOption = 'default' | 'dueDate' | 'priority' | 'alphabetical' | 'createdAt'

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'createdAt', label: 'Recently Created' },
]

const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: React.ElementType }> = {
  URGENT: { label: 'Urgent', color: 'var(--error)',           icon: AlertCircle },
  HIGH:   { label: 'High',   color: 'var(--priority-high)',   icon: ArrowUp },
  MEDIUM: { label: 'Medium', color: 'var(--priority-medium)', icon: Minus },
  LOW:    { label: 'Low',    color: 'var(--priority-low)',     icon: Flag },
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  TODO:        { label: 'To Do',       color: 'var(--text-tertiary)',    icon: Circle },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--accent-brand)',     icon: Clock },
  IN_REVIEW:   { label: 'In Review',   color: 'var(--priority-high)',    icon: Circle },
  DONE:        { label: 'Done',        color: 'var(--success)',          icon: CheckCircle2 },
  CANCELLED:   { label: 'Cancelled',   color: 'var(--text-disabled)',    icon: X },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority]
  const Icon = cfg.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.1875rem',
      fontSize: '0.5625rem', fontWeight: 600, letterSpacing: '0.02em',
      padding: '0.125rem 0.3125rem', borderRadius: '0.25rem',
      background: `${cfg.color}14`, color: cfg.color,
    }}>
      <Icon size={8} strokeWidth={2.5} />
      {cfg.label}
    </span>
  )
}

function DueDateBadge({ dueDate, done }: { dueDate: string; done: boolean }) {
  const d = new Date(dueDate)
  const now = new Date()
  const overdue = !done && d < now
  const today   = !done && d.toDateString() === now.toDateString()
  const color   = overdue ? 'var(--error)' : today ? 'var(--priority-high)' : 'var(--text-tertiary)'
  return (
    <span style={{ fontSize: '0.5625rem', fontWeight: 500, color }}>
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  )
}

function UserAvatar({ initials, name, size = 20 }: { initials?: string; name?: string; size?: number }) {
  const text = initials || (name ? name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '?')
  const hue = name ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360 : 200
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: name ? `oklch(0.68 0.18 ${hue})` : 'var(--surface-active)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(8, size * 0.36), fontWeight: 700, color: '#fff',
      flexShrink: 0, letterSpacing: '-0.01em', lineHeight: 1,
    }}>
      {text}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task Card (Kanban)
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onSelect,
  onStatusChange,
  isDragging,
  dropTargetEdge,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropCard,
}: {
  task: Task
  onSelect: (t: Task) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  isDragging?: boolean
  dropTargetEdge?: 'top' | 'bottom' | null
  onDragStart: (taskId: string) => void
  onDragEnd: () => void
  onDragOverCard: (taskId: string, edge: 'top' | 'bottom') => void
  onDropCard: (taskId: string) => void
}) {
  const done = task.status === 'DONE' || task.status === 'CANCELLED'
  const assigneeInitials = task.assignee?.displayName
    ?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'
  const taskCode = `SYN-${task.id.slice(-6).toUpperCase()}`

  const subtasks = useTaskStore((s) => s.subtasksByTask[task.id]) ?? []
  const subtaskDone = subtasks.filter((s) => s.done).length
  const subtaskTotal = subtasks.length

  const comments = useTaskStore((s) => s.commentsByTask[task.id]) ?? []

  return (
    <div
      className={`task-card${isDragging ? ' is-dragging' : ''}${
        dropTargetEdge === 'top' ? ' drop-target-top' : dropTargetEdge === 'bottom' ? ' drop-target-bottom' : ''
      }`}
      onClick={() => onSelect(task)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const isTop = (e.clientY - rect.top) < (rect.height / 2)
        onDragOverCard(task.id, isTop ? 'top' : 'bottom')
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropCard(task.id)
      }}
    >
      {/* Header row: status dot + priority + menu */}
      <div className="task-card-header">
        <button
          type="button"
          className="task-status-btn"
          title={`Status: ${STATUS_CONFIG[task.status].label}`}
          onClick={(e) => {
            e.stopPropagation()
            const statuses: TaskStatus[] = ['TODO','IN_PROGRESS','IN_REVIEW','DONE']
            const idx = statuses.indexOf(task.status)
            onStatusChange(task.id, statuses[(idx + 1) % statuses.length])
          }}
          style={{ color: STATUS_CONFIG[task.status].color }}
        >
          {(() => { const Icon = STATUS_CONFIG[task.status].icon; return <Icon size={13} strokeWidth={1.75} /> })()}
        </button>
        {(task.priority === 'URGENT' || task.priority === 'HIGH') && (
          <PriorityBadge priority={task.priority} />
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="task-card-menu-btn"
          onClick={(e) => { e.stopPropagation(); onSelect(task) }}
          title="Task details"
        >
          <MoreHorizontal size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* Title */}
      <p className={`task-card-title${done ? ' done' : ''}`}>{task.title}</p>

      {/* Color-Coded Tags */}
      {(() => {
        const parsed = parseTags(task.labels)
        const tags = parsed.length > 0 ? parsed : getTaskTags(task)
        if (tags.length === 0) return null
        const visibleTags = tags.length > 3 ? tags.slice(0, 2) : tags
        const overflow = tags.length > 3 ? tags.slice(2) : []

        return (
          <div className="task-card-tags">
            {visibleTags.map((tag) => {
              const color = getTagColor(tag)
              return (
                <span
                  key={tag}
                  className="task-tag-badge"
                  style={{
                    backgroundColor: color.bg,
                    color: color.text,
                    borderColor: color.border,
                  }}
                >
                  {tag}
                </span>
              )
            })}
            {overflow.length > 0 && (
              <span
                className="task-tag-badge overflow"
                title={overflow.join(', ')}
              >
                +{overflow.length}
              </span>
            )}
          </div>
        )
      })()}

      {/* Footer: assignee + due date */}
      <div className="task-card-footer">
        <span className="task-card-id">{taskCode}</span>
        <div style={{ flex: 1 }} />
        {subtaskTotal > 0 && (
          <span
            className="task-card-meta-badge"
            title={`${subtaskDone} of ${subtaskTotal} subtasks done`}
            style={{ color: subtaskDone === subtaskTotal ? 'var(--success)' : 'var(--text-tertiary)' }}
          >
            <CheckSquare size={9} strokeWidth={2.5} />
            {subtaskDone}/{subtaskTotal}
          </span>
        )}
        {comments.length > 0 && (
          <span
            className="task-card-meta-badge"
            title={`${comments.length} comment${comments.length === 1 ? '' : 's'}`}
            style={{ color: 'var(--text-tertiary)' }}
          >
            <MessageSquare size={9} strokeWidth={2} />
            {comments.length}
          </span>
        )}
        {task.assignee ? (
          <UserAvatar initials={assigneeInitials} name={task.assignee.displayName} size={18} />
        ) : (
          <div className="task-card-unassigned-avatar" title="Unassigned" />
        )}
        {task.dueDate && <DueDateBadge dueDate={task.dueDate} done={done} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onSelectTask,
  onStatusChange,
  isFiltered,
  draggedTaskId,
  dragOverTarget,
  isDragOverCol,
  onDragStartTask,
  onDragEndTask,
  onDragOverCard,
  onDropOnCard,
  onDragOverCol,
  onDropOnCol,
}: {
  column: Column
  tasks: Task[]
  onAddTask: (columnId: string) => void
  onSelectTask: (t: Task) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  isFiltered?: boolean
  draggedTaskId: string | null
  dragOverTarget: { taskId: string; edge: 'top' | 'bottom' } | null
  isDragOverCol: boolean
  onDragStartTask: (taskId: string) => void
  onDragEndTask: () => void
  onDragOverCard: (colId: string, taskId: string, edge: 'top' | 'bottom') => void
  onDropOnCard: (colId: string, taskId: string) => void
  onDragOverCol: (colId: string) => void
  onDropOnCol: (colId: string) => void
}) {
  return (
    <div className={`kanban-column${isDragOverCol ? ' is-drag-over' : ''}`}>
      {/* Column header */}
      <div className="kanban-col-header">
        <span className="kanban-col-name">{column.name}</span>
        <span className="kanban-col-count">{tasks.length}</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="kanban-col-add-btn"
          onClick={() => onAddTask(column.id)}
          title="Add task"
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Task cards */}
      <div
        className="kanban-col-body"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          onDragOverCol(column.id)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDropOnCol(column.id)
        }}
      >
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onSelect={onSelectTask}
            onStatusChange={onStatusChange}
            isDragging={draggedTaskId === task.id}
            dropTargetEdge={dragOverTarget?.taskId === task.id ? dragOverTarget.edge : null}
            onDragStart={onDragStartTask}
            onDragEnd={onDragEndTask}
            onDragOverCard={(taskId, edge) => onDragOverCard(column.id, taskId, edge)}
            onDropCard={(taskId) => onDropOnCard(column.id, taskId)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="kanban-col-empty">{isFiltered ? 'No matching tasks' : 'No tasks'}</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workflow stages for List View
// ---------------------------------------------------------------------------

const WORKFLOW_STAGES: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'TODO',        label: 'TO DO',       color: 'var(--text-tertiary)' },
  { status: 'IN_PROGRESS', label: 'IN PROGRESS', color: 'var(--accent-brand)' },
  { status: 'IN_REVIEW',   label: 'IN REVIEW',   color: 'var(--warning)' },
  { status: 'DONE',        label: 'DONE',        color: 'var(--success)' },
]

function TableDueBadge({ dueDate, done }: { dueDate?: string | null; done: boolean }) {
  if (!dueDate) return <span style={{ color: 'var(--text-disabled)', fontSize: '0.75rem' }}>—</span>
  const d = new Date(dueDate)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const isOverdue = !done && d < todayStart
  const isToday = !done && d >= todayStart && d <= todayEnd

  const color = isOverdue ? 'var(--error)' : isToday ? 'var(--warning)' : 'var(--text-secondary)'
  const bg = isOverdue ? 'rgba(239, 68, 68, 0.1)' : isToday ? 'rgba(245, 158, 11, 0.1)' : 'var(--surface-active)'
  const text = isOverdue
    ? `Overdue · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : isToday
    ? 'Due Today'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <span
      className="task-table-pill"
      style={{ color, background: bg }}
    >
      <Calendar size={10} strokeWidth={2} />
      <span>{text}</span>
    </span>
  )
}

function TablePriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority]
  const flagEmojis: Record<TaskPriority, string> = {
    URGENT: '🔴',
    HIGH:   '🟠',
    MEDIUM: '🔵',
    LOW:    '⚪',
  }
  return (
    <span
      className="task-table-pill"
      style={{
        color: cfg.color,
        background: `${cfg.color}14`,
      }}
    >
      <span>{flagEmojis[priority] ?? '⚪'}</span>
      <span>{cfg.label}</span>
    </span>
  )
}

function TableSubtaskIndicator({ taskId }: { taskId: string }) {
  const subtasks = useTaskStore((s) => s.subtasksByTask[taskId]) ?? []
  if (subtasks.length === 0) {
    return <span style={{ color: 'var(--text-disabled)', fontSize: '0.75rem' }}>—</span>
  }
  const completed = subtasks.filter((s) => s.done).length
  const allDone = completed === subtasks.length
  return (
    <span
      className="task-table-pill"
      style={{
        color: allDone ? 'var(--success)' : 'var(--text-secondary)',
        background: allDone ? 'rgba(34, 197, 94, 0.1)' : 'var(--surface-active)',
      }}
      title={`${completed} of ${subtasks.length} subtasks completed`}
    >
      <CheckSquare size={10} strokeWidth={2.5} />
      <span>{completed}/{subtasks.length}</span>
    </span>
  )
}

function TaskTableRow({
  task,
  onSelect,
  onToggleDone,
}: {
  task: Task
  onSelect: (t: Task) => void
  onToggleDone: (t: Task) => void
}) {
  const done = task.status === 'DONE' || task.status === 'CANCELLED'
  const taskCode = `SYN-${task.id.slice(-6).toUpperCase()}`

  return (
    <div
      className={`task-table-row${done ? ' done' : ''}`}
      onClick={() => onSelect(task)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(task)
      }}
    >
      {/* 1. Select / Checkbox Column (Width: 40px) */}
      <div className="task-table-col col-check" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`task-table-checkbox${done ? ' checked' : ''}`}
          onClick={() => onToggleDone(task)}
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        >
          {done && <Check size={10} strokeWidth={3} />}
        </button>
      </div>

      {/* 2. Task Name & ID Column (Flex / Primary) */}
      <div className="task-table-col col-title">
        <span className="task-table-id">{taskCode}</span>
        <span className={`task-table-title${done ? ' done' : ''}`} title={task.title}>
          {task.title}
        </span>
      </div>

      {/* 3. Tags Column (Width: 150px) */}
      <div className="task-table-col col-tags">
        {(() => {
          const parsed = parseTags(task.labels)
          const tags = parsed.length > 0 ? parsed : getTaskTags(task)
          if (tags.length === 0) {
            return <span className="task-table-no-tags">—</span>
          }
          const visibleTags = tags.length > 2 ? tags.slice(0, 2) : tags
          const overflow = tags.length > 2 ? tags.slice(2) : []

          return (
            <div className="task-table-tags-wrap">
              {visibleTags.map((tag) => {
                const color = getTagColor(tag)
                return (
                  <span
                    key={tag}
                    className="task-tag-badge table"
                    style={{
                      backgroundColor: color.bg,
                      color: color.text,
                      borderColor: color.border,
                    }}
                  >
                    {tag}
                  </span>
                )
              })}
              {overflow.length > 0 && (
                <span
                  className="task-tag-badge overflow"
                  title={overflow.join(', ')}
                >
                  +{overflow.length}
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* 4. Assignee Column (Width: 140px) */}
      <div className="task-table-col col-assignee">
        {task.assignee ? (
          <div className="task-table-assignee-wrap">
            <UserAvatar name={task.assignee.displayName} size={18} />
            <span className="task-table-assignee-name" title={task.assignee.displayName}>
              {task.assignee.displayName}
            </span>
          </div>
        ) : (
          <span className="task-table-unassigned">Unassigned</span>
        )}
      </div>

      {/* 5. Due Date Column (Width: 120px) */}
      <div className="task-table-col col-due">
        <TableDueBadge dueDate={task.dueDate} done={done} />
      </div>

      {/* 6. Priority Column (Width: 120px) */}
      <div className="task-table-col col-priority">
        <TablePriorityBadge priority={task.priority} />
      </div>

      {/* 7. Subtasks Progress Column (Width: 90px) */}
      <div className="task-table-col col-subtasks">
        <TableSubtaskIndicator taskId={task.id} />
      </div>
    </div>
  )
}

function TaskTableStatusSection({
  stage,
  tasks,
  isCollapsed,
  onToggleCollapse,
  onSelectTask,
  onToggleDone,
  isAdding,
  onStartAdd,
  onCancelAdd,
  inlineTitle,
  onInlineTitleChange,
  onSubmitInlineAdd,
}: {
  stage: { status: TaskStatus; label: string; color: string }
  tasks: Task[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelectTask: (t: Task) => void
  onToggleDone: (t: Task) => void
  isAdding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  inlineTitle: string
  onInlineTitleChange: (val: string) => void
  onSubmitInlineAdd: () => void
}) {
  const inlineInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAdding) {
      inlineInputRef.current?.focus()
    }
  }, [isAdding])

  return (
    <div className="tasks-table-group">
      {/* Group Header */}
      <div className="tasks-table-group-header" onClick={onToggleCollapse}>
        <button
          type="button"
          className="tasks-table-group-chevron"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? (
            <ChevronRight size={13} strokeWidth={2.5} />
          ) : (
            <ChevronDown size={13} strokeWidth={2.5} />
          )}
        </button>

        <span
          className="tasks-table-group-dot"
          style={{ background: stage.color }}
        />

        <span className="tasks-table-group-name">{stage.label}</span>
        <span className="tasks-table-group-count">{tasks.length}</span>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="tasks-table-group-add-btn"
          onClick={(e) => {
            e.stopPropagation()
            onStartAdd()
          }}
          title={`Add task to ${stage.label}`}
        >
          <Plus size={12} strokeWidth={2.5} />
          <span>Add task</span>
        </button>
      </div>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div className="tasks-table-grid">
          {/* Column Headers */}
          <div className="task-table-header" role="row">
            <div className="task-table-col col-check" />
            <div className="task-table-col col-title">Name</div>
            <div className="task-table-col col-tags">Tags</div>
            <div className="task-table-col col-assignee">Assignee</div>
            <div className="task-table-col col-due">Due Date</div>
            <div className="task-table-col col-priority">Priority</div>
            <div className="task-table-col col-subtasks">Subtasks</div>
          </div>

          {/* Task Rows */}
          {tasks.map((task) => (
            <TaskTableRow
              key={task.id}
              task={task}
              onSelect={onSelectTask}
              onToggleDone={onToggleDone}
            />
          ))}

          {/* Empty Row if 0 tasks and not adding */}
          {tasks.length === 0 && !isAdding && (
            <div className="task-table-empty">
              No tasks in {stage.label.toLowerCase()}
            </div>
          )}

          {/* Inline Add Task Row */}
          {isAdding ? (
            <div className="task-table-inline-add-row" onClick={(e) => e.stopPropagation()}>
              <div className="task-table-col col-check">
                <Plus size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)', margin: 'auto' }} />
              </div>
              <input
                ref={inlineInputRef}
                type="text"
                className="task-table-inline-input"
                placeholder="What needs to be done? (press Enter to save, Esc to cancel)"
                value={inlineTitle}
                onChange={(e) => onInlineTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSubmitInlineAdd()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    onCancelAdd()
                  }
                }}
              />
              <div className="task-table-inline-actions">
                <button
                  type="button"
                  className="task-table-inline-btn primary"
                  onClick={onSubmitInlineAdd}
                  disabled={!inlineTitle.trim()}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="task-table-inline-btn secondary"
                  onClick={onCancelAdd}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="task-table-inline-add-trigger"
              onClick={onStartAdd}
            >
              <Plus size={11} strokeWidth={2.5} />
              <span>Add task...</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Task Modal
// ---------------------------------------------------------------------------

function CreateTaskModal({ projectId, columnId, columns, onClose, onCreated }: {
  projectId: string
  columnId: string
  columns: Column[]
  onClose: () => void
  onCreated: () => void
}) {
  const { createTask } = useTaskStore()
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [priority,    setPriority]    = useState<TaskPriority>('MEDIUM')
  const [colId,       setColId]       = useState(columnId)
  const [dueDate,     setDueDate]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50) }, [])

  const submit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true); setError(null)
    try {
      await createTask({
        projectId, columnId: colId, title: title.trim(),
        description: description || undefined,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      })
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create task')
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300, backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Create task" style={{ zIndex: 301 }}>
        <div className="modal-header">
          <span className="modal-title">New Task</span>
          <button className="modal-close" onClick={onClose}><X size={14} strokeWidth={2} /></button>
        </div>

        <div className="modal-body">
          <input
            ref={titleRef}
            className="modal-input"
            placeholder="Task title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />

          <textarea
            className="modal-textarea"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />

          <div className="modal-row">
            <div className="modal-field">
              <label className="modal-label">Column</label>
              <select className="modal-select" value={colId} onChange={e => setColId(e.target.value)}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Priority</label>
              <select className="modal-select" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Due date</label>
              <input type="date" className="modal-select" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {error && <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '0.5rem' }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={13} strokeWidth={2.5} />}
            Create Task
          </button>
        </div>
      </div>
    </>
  )
}

// TaskDetailPanel removed — replaced by TaskDetailDrawer (see task-detail-drawer.tsx)

// ---------------------------------------------------------------------------
// Create Project Modal
// ---------------------------------------------------------------------------

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { createProject } = useTaskStore()
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])

  const submit = async () => {
    if (!name.trim()) { setError('Project name is required'); return }
    setLoading(true); setError(null)
    try {
      const p = await createProject({ name: name.trim(), description: desc || undefined })
      onCreated(p.id)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create project')
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 300, backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Create project" style={{ zIndex: 301, maxWidth: '26rem' }}>
        <div className="modal-header">
          <span className="modal-title">New Project</span>
          <button className="modal-close" onClick={onClose}><X size={14} strokeWidth={2} /></button>
        </div>
        <div className="modal-body">
          <input ref={ref} className="modal-input" placeholder="Project name…" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <textarea className="modal-textarea" placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          {error && <p style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '0.5rem' }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn primary" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={13} strokeWidth={2.5} />}
            Create Project
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// TasksPage
// ---------------------------------------------------------------------------

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const {
    projects, projectsLoading,
    activeProjectId, columns, tasksByColumn, columnsLoading,
    selectedTask,
    fetchProjects, setActiveProject, createTask, updateTask, moveTask, selectTask, fetchTaskById,
  } = useTaskStore()

  const channels = useChatStore((s) => s.channels)

  const [view, setView]                   = useState<'board' | 'list'>(() => searchParams.get('subview') === 'list' ? 'list' : 'board')
  const [createTaskCol, setCreateTaskCol] = useState<string | null>(null)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [seeding, setSeeding]             = useState(false)

  // ── Drag-and-drop state ──────────────────────────────────────────────
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ taskId: string; edge: 'top' | 'bottom' } | null>(null)

  // ── Collapsible status sections & inline add state for List View ───────
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [addingSection, setAddingSection] = useState<TaskStatus | null>(null)
  const [inlineTitleByStatus, setInlineTitleByStatus] = useState<Record<string, string>>({})

  const { setLabel } = useBreadcrumbStore()
  const tenant = useAuthStore((s) => s.tenant)
  const currentUser = useAuthStore((s) => s.user)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])

  // ── Filters & Sort state ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery]       = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([])
  const [statusFilter, setStatusFilter]     = useState<TaskStatus[]>([])
  const [tagFilter, setTagFilter]           = useState<string[]>([])
  const [sortBy, setSortBy]                 = useState<SortOption>('default')

  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen]     = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef   = useRef<HTMLDivElement>(null)

  // Close filter/sort dropdowns on outside click
  useEffect(() => {
    if (!filterOpen && !sortOpen) return
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterOpen, sortOpen])

  // Fetch workspace members for assignee chips
  useEffect(() => {
    let isMounted = true
    if (tenant?.workspaceId) {
      workspaceSettingsApi.getMembers(tenant.workspaceId)
        .then(data => { if (isMounted) setWorkspaceMembers(data) })
        .catch(() => {})
    }
    return () => { isMounted = false }
  }, [tenant?.workspaceId])

  // Aggregate member chips (workspace members + task assignees)
  const memberChips = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatarUrl?: string | null }>()
    for (const m of workspaceMembers) {
      map.set(m.id, { id: m.id, name: m.displayName, avatarUrl: m.avatarUrl })
    }
    for (const tasks of Object.values(tasksByColumn)) {
      for (const t of tasks) {
        if (t.assignee) {
          map.set(t.assignee.id, { id: t.assignee.id, name: t.assignee.displayName, avatarUrl: t.assignee.avatarUrl })
        }
      }
    }
    if (currentUser && !map.has(currentUser.id)) {
      map.set(currentUser.id, { id: currentUser.id, name: currentUser.displayName })
    }
    return Array.from(map.values())
  }, [workspaceMembers, tasksByColumn, currentUser])

  // Aggregate unique tags across tasks for tag filter
  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const tasks of Object.values(tasksByColumn)) {
      for (const t of tasks) {
        const parsed = parseTags(t.labels)
        const tags = parsed.length > 0 ? parsed : getTaskTags(t)
        for (const tag of tags) {
          set.add(tag)
        }
      }
    }
    if (set.size === 0) {
      ;['Frontend', 'Backend', 'API', 'Bug', 'Design', 'P0'].forEach((t) => set.add(t))
    }
    return Array.from(set).sort()
  }, [tasksByColumn])

  // Filtered & sorted tasks by column
  const filteredTasksByColumn = useMemo(() => {
    const result: Record<string, Task[]> = {}
    const query = searchQuery.trim().toLowerCase()

    for (const [colId, tasks] of Object.entries(tasksByColumn)) {
      let filtered = tasks.filter(task => {
        // Search filter (title & description)
        if (query) {
          const matchTitle = task.title.toLowerCase().includes(query)
          const matchDesc = task.description?.toLowerCase().includes(query)
          if (!matchTitle && !matchDesc) return false
        }

        // Assignee filter
        if (assigneeFilter !== null) {
          if (task.assigneeId !== assigneeFilter) return false
        }

        // Priority filter
        if (priorityFilter.length > 0) {
          if (!priorityFilter.includes(task.priority)) return false
        }

        // Status filter
        if (statusFilter.length > 0) {
          if (!statusFilter.includes(task.status)) return false
        }

        // Tag filter
        if (tagFilter.length > 0) {
          const parsed = parseTags(task.labels)
          const taskTags = parsed.length > 0 ? parsed : getTaskTags(task)
          const matchTag = tagFilter.some((tf) =>
            taskTags.some((tt) => tt.toLowerCase() === tf.toLowerCase())
          )
          if (!matchTag) return false
        }

        return true
      })

      // Sorting
      if (sortBy !== 'default') {
        filtered = [...filtered].sort((a, b) => {
          if (sortBy === 'dueDate') {
            if (!a.dueDate && !b.dueDate) return 0
            if (!a.dueDate) return 1
            if (!b.dueDate) return -1
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          }
          if (sortBy === 'priority') {
            const PRIORITY_WEIGHT: Record<TaskPriority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
            return (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0)
          }
          if (sortBy === 'alphabetical') {
            return a.title.localeCompare(b.title)
          }
          if (sortBy === 'createdAt') {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          }
          return 0
        })
      }

      result[colId] = filtered
    }

    return result
  }, [tasksByColumn, searchQuery, assigneeFilter, priorityFilter, statusFilter, tagFilter, sortBy])

  const isFiltered = Boolean(
    searchQuery.trim() ||
    assigneeFilter !== null ||
    priorityFilter.length > 0 ||
    statusFilter.length > 0 ||
    tagFilter.length > 0 ||
    sortBy !== 'default'
  )

  const handleClearAllFilters = () => {
    setSearchQuery('')
    setAssigneeFilter(null)
    setPriorityFilter([])
    setStatusFilter([])
    setTagFilter([])
    setSortBy('default')
  }

  const getSortLabel = (key: SortOption) => {
    const match = SORT_OPTIONS.find(o => o.key === key)
    return match && match.key !== 'default' ? `Sort: ${match.label}` : 'Sort'
  }

  // ── Derived tasks grouped by workflow status for List View ────────────
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      IN_REVIEW: [],
      DONE: [],
      CANCELLED: [],
    }
    for (const tasks of Object.values(filteredTasksByColumn)) {
      for (const t of tasks) {
        if (map[t.status]) {
          map[t.status].push(t)
        } else {
          map.TODO.push(t)
        }
      }
    }

    if (sortBy !== 'default') {
      const sortFn = (a: Task, b: Task) => {
        if (sortBy === 'dueDate') {
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        }
        if (sortBy === 'priority') {
          const PRIORITY_WEIGHT: Record<TaskPriority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
          return (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0)
        }
        if (sortBy === 'alphabetical') {
          return a.title.localeCompare(b.title)
        }
        if (sortBy === 'createdAt') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
        return 0
      }
      for (const s of Object.keys(map) as TaskStatus[]) {
        map[s].sort(sortFn)
      }
    }

    return map
  }, [filteredTasksByColumn, sortBy])

  // Filter display stages if status filter is active
  const displayStages = useMemo(() => {
    if (statusFilter.length === 0) return WORKFLOW_STAGES
    return WORKFLOW_STAGES.filter(stage => statusFilter.includes(stage.status))
  }, [statusFilter])

  const toggleCollapse = (status: TaskStatus) => {
    setCollapsedSections(prev => ({ ...prev, [status]: !prev[status] }))
  }

  const getColumnIdForStatus = (status: TaskStatus): string | undefined => {
    if (!columns.length) return undefined
    const match = columns.find(c => {
      const cName = c.name.toLowerCase()
      if (status === 'TODO' && (cName.includes('to do') || cName.includes('todo') || cName.includes('backlog'))) return true
      if (status === 'IN_PROGRESS' && (cName.includes('progress') || cName.includes('doing') || cName.includes('active'))) return true
      if (status === 'IN_REVIEW' && (cName.includes('review') || cName.includes('testing') || cName.includes('qa'))) return true
      if (status === 'DONE' && (cName.includes('done') || cName.includes('complete') || cName.includes('finish'))) return true
      return false
    })
    return match?.id ?? columns[0]?.id
  }

  const handleInlineCreateTask = async (status: TaskStatus) => {
    const title = (inlineTitleByStatus[status] ?? '').trim()
    if (!title || !activeProjectId) return
    const colId = getColumnIdForStatus(status)
    if (!colId) return

    try {
      await createTask({
        projectId: activeProjectId,
        columnId: colId,
        title,
        status,
        priority: 'MEDIUM',
      })
      setInlineTitleByStatus(prev => ({ ...prev, [status]: '' }))
      setAddingSection(null)
    } catch (err) {
      console.error('Failed to create task inline', err)
    }
  }

  // Sync view state when subview search param changes
  useEffect(() => {
    const sv = searchParams.get('subview')
    setView(sv === 'list' ? 'list' : 'board')
  }, [searchParams])

  // Open create project modal when action=new-project param is present
  useEffect(() => {
    if (searchParams.get('action') === 'new-project') {
      setShowCreateProject(true)
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('action')
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Load projects on mount
  useEffect(() => { fetchProjects(); return () => setLabel(null) }, [])

  // Auto-select first project if no project is active and no taskId is pending
  useEffect(() => {
    if (projects.length > 0 && !activeProjectId && !searchParams.get('taskId')) {
      setActiveProject(projects[0].id)
    }
  }, [projects, activeProjectId, searchParams])

  // ── URL sync: ?taskId=<id> opens the drawer (with direct-load fetch support) ─
  useEffect(() => {
    const taskId = searchParams.get('taskId')
    if (!taskId) {
      if (selectedTask) selectTask(null)
      return
    }

    // Already selected?
    if (selectedTask?.id === taskId) return

    // 1. Look in already loaded columns
    for (const tasks of Object.values(tasksByColumn)) {
      const found = tasks.find(t => t.id === taskId)
      if (found) {
        selectTask(found)
        return
      }
    }

    // 2. Not in current columns? Fetch directly via API (e.g. direct link or from another project)
    fetchTaskById(taskId).then((fetched) => {
      if (fetched) {
        if (fetched.projectId && fetched.projectId !== activeProjectId) {
          setActiveProject(fetched.projectId)
        }
        selectTask(fetched)
      }
    })
  }, [searchParams, tasksByColumn, selectedTask, activeProjectId, fetchTaskById, setActiveProject, selectTask])

  // Handler: open task drawer and set URL param
  const handleSelectTask = (task: Task) => {
    selectTask(task)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('taskId', task.id)
      return next
    }, { replace: true })
  }

  // Handler: close task drawer and clear URL param
  const handleCloseDrawer = () => {
    selectTask(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('taskId')
      return next
    }, { replace: true })
  }

  const handleViewChange = (newView: 'board' | 'list') => {
    setView(newView)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (newView === 'board') {
        next.set('subview', 'board')
      } else {
        next.set('subview', 'list')
      }
      return next
    })
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await updateTask(taskId, { status })
  }

  // ── Drag & Drop Handlers (Fractional Indexing - ADR-002) ───────────────────
  const handleDragStartTask = (taskId: string) => {
    setDraggedTaskId(taskId)
  }

  const handleDragEndTask = () => {
    setDraggedTaskId(null)
    setDragOverColId(null)
    setDragOverTarget(null)
  }

  const handleDragOverCard = (colId: string, taskId: string, edge: 'top' | 'bottom') => {
    setDragOverColId(colId)
    setDragOverTarget({ taskId, edge })
  }

  const handleDragOverCol = (colId: string) => {
    setDragOverColId(colId)
  }

  const handleExecuteDrop = async (
    targetColId: string,
    targetCardId: string | null,
    edge: 'top' | 'bottom' | null
  ) => {
    if (!draggedTaskId) return

    // Locate source column and task instance
    let sourceColId: string | null = null
    let draggedTask: Task | undefined
    for (const [colId, list] of Object.entries(tasksByColumn)) {
      const match = list.find((t) => t.id === draggedTaskId)
      if (match) {
        sourceColId = colId
        draggedTask = match
        break
      }
    }

    if (!sourceColId || !draggedTask) {
      handleDragEndTask()
      return
    }

    // Exclude the dragged task from neighbor position calculations
    const targetColTasks = (tasksByColumn[targetColId] ?? []).filter((t) => t.id !== draggedTaskId)

    let newPosition = 1024

    if (targetColTasks.length === 0) {
      // 1. Dropping into an empty column: seed position 1024
      newPosition = 1024
    } else if (targetCardId && edge) {
      const targetIdx = targetColTasks.findIndex((t) => t.id === targetCardId)

      if (targetIdx === -1) {
        // Fallback: append after the last card
        const lastTask = targetColTasks[targetColTasks.length - 1]
        newPosition = lastTask.position + 1024
      } else if (edge === 'top') {
        if (targetIdx === 0) {
          // 2. Dropping before first card (P_0): bisect (P_0 / 2) or decrement (P_0 - 1024)
          const p0 = targetColTasks[0].position
          newPosition = p0 > 0 ? p0 / 2 : p0 - 1024
        } else {
          // 4. Dropping between P_A (targetIdx - 1) and P_B (targetIdx): midpoint
          const pA = targetColTasks[targetIdx - 1].position
          const pB = targetColTasks[targetIdx].position
          newPosition = (pA + pB) / 2
        }
      } else {
        // edge === 'bottom'
        if (targetIdx === targetColTasks.length - 1) {
          // 3. Dropping after last card (P_N): increment by 1024
          const pN = targetColTasks[targetIdx].position
          newPosition = pN + 1024
        } else {
          // 4. Dropping between P_A (targetIdx) and P_B (targetIdx + 1): midpoint
          const pA = targetColTasks[targetIdx].position
          const pB = targetColTasks[targetIdx + 1].position
          newPosition = (pA + pB) / 2
        }
      }
    } else {
      // Dropping onto column container: append after last card
      const pN = targetColTasks[targetColTasks.length - 1].position
      newPosition = pN + 1024
    }

    // Sync status if target column name maps to a standard workflow stage
    const targetCol = columns.find((c) => c.id === targetColId)
    if (targetCol) {
      const lower = targetCol.name.toLowerCase()
      let mappedStatus: TaskStatus | undefined
      if (lower.includes('progress') || lower.includes('doing') || lower.includes('active')) mappedStatus = 'IN_PROGRESS'
      else if (lower.includes('review') || lower.includes('testing') || lower.includes('qa')) mappedStatus = 'IN_REVIEW'
      else if (lower.includes('done') || lower.includes('complete') || lower.includes('finish')) mappedStatus = 'DONE'
      else if (lower.includes('todo') || lower.includes('to do') || lower.includes('backlog')) mappedStatus = 'TODO'

      if (mappedStatus && mappedStatus !== draggedTask.status) {
        updateTask(draggedTaskId, { status: mappedStatus }).catch(() => {})
      }
    }

    const tId = draggedTaskId
    handleDragEndTask()

    try {
      await moveTask(tId, sourceColId, targetColId, newPosition)
    } catch {
      // Revert is handled automatically by optimistic store error handling
    }
  }

  const handleDropOnCard = (colId: string, taskId: string) => {
    if (!draggedTaskId || !dragOverTarget) return
    handleExecuteDrop(colId, taskId, dragOverTarget.edge)
  }

  const handleDropOnCol = (colId: string) => {
    if (!draggedTaskId) return
    handleExecuteDrop(colId, null, null)
  }

  // ── Cross-link: find the channel matching the active project by name ──
  const handleOpenChannel = () => {
    const activeProject = projects.find(p => p.id === activeProjectId)
    if (activeProject) {
      const slug = activeProject.name.trim().toLowerCase().replace(/\s+/g, '-')
      const match = channels.find(c =>
        c.type !== 'DIRECT' &&
        c.name != null &&
        (c.name.toLowerCase() === slug ||
         c.name.toLowerCase() === activeProject.name.trim().toLowerCase())
      )
      if (match) {
        navigate(`/workspace/chat?channel=${match.id}`)
        return
      }
    }
    navigate('/workspace/chat')
  }

  const handleSeed = async () => {
    if (seeding) return
    setSeeding(true)
    try {
      const result = await runSeedData({
        id: currentUser?.id || 'admin-seed',
        displayName: currentUser?.displayName || 'Syncra Admin',
      })
      await fetchProjects()
      const latestProjects = useTaskStore.getState().projects
      if (!activeProjectId && latestProjects.length > 0) {
        await setActiveProject(latestProjects[0].id)
      } else if (activeProjectId) {
        await setActiveProject(activeProjectId)
      }
      if (result.projectsCreated > 0 || result.tasksCreated > 0) {
        alert(`Seeded ${result.tasksCreated} tasks across ${result.projectsCreated} projects.`)
      } else {
        alert('Demo data already seeded. All projects and tasks exist.')
      }
    } catch (e) {
      alert('Seed failed: ' + (e as Error).message)
    } finally {
      setSeeding(false)
    }
  }

  // ── Empty state: no projects ──
  if (!projectsLoading && projects.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', padding: '2rem' }}>
        <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '1rem', background: 'var(--surface-card)', border: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <FolderOpen size={22} strokeWidth={1.5} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: '20rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>No projects yet</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Create your first project to start tracking tasks across your team.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="tasks-create-project-btn" onClick={() => setShowCreateProject(true)}>
            <Plus size={14} strokeWidth={2.5} /> New Project
          </button>
          <button
            className="tasks-seed-btn"
            onClick={handleSeed}
            disabled={seeding}
            title="Seed demo data (developer utility)"
          >
            {seeding ? <Loader2 size={12} className="spin" /> : <Database size={12} />}
            {seeding ? 'Seeding…' : 'Seed Data'}
          </button>
        </div>
        {showCreateProject && (
          <CreateProjectModal
            onClose={() => setShowCreateProject(false)}
            onCreated={(id) => setActiveProject(id)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="tasks-page">
      {/* ── Toolbar ── */}
      <div className="tasks-toolbar">
        {/* Project picker */}
        <div className="tasks-project-picker">
          <select
            className="tasks-project-select"
            value={activeProjectId ?? ''}
            onChange={e => setActiveProject(e.target.value)}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={12} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0, pointerEvents: 'none' }} />
        </div>

        {/* Developer seed button */}
        <button
          className="tasks-seed-btn"
          onClick={handleSeed}
          disabled={seeding}
          title="Seed demo data (developer utility)"
        >
          {seeding ? <Loader2 size={12} className="spin" /> : <Database size={12} />}
          {seeding ? 'Seeding…' : 'Seed Data'}
        </button>

        <div className="tasks-toolbar-divider" />

        {/* A. Instant Task Search Input */}
        <div className="tasks-search-wrap">
          <Search size={13} strokeWidth={2} className="tasks-search-icon" />
          <input
            type="text"
            className="tasks-search-input"
            placeholder="Filter tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="tasks-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* B. Assignee Avatar Quick-Filter Chips */}
        <div className="tasks-member-chips" role="group" aria-label="Filter by assignee">
          <button
            type="button"
            className={`tasks-member-chip all${assigneeFilter === null ? ' active' : ''}`}
            onClick={() => setAssigneeFilter(null)}
            title="Show tasks for all members"
          >
            All
          </button>
          {memberChips.map(m => {
            const initials = m.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
            const isActive = assigneeFilter === m.id
            const hue = m.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
            return (
              <button
                key={m.id}
                type="button"
                className={`tasks-member-chip avatar${isActive ? ' active' : ''}`}
                onClick={() => setAssigneeFilter(isActive ? null : m.id)}
                title={`Filter by: ${m.name}`}
                style={{
                  background: `oklch(0.68 0.18 ${hue})`,
                }}
              >
                {initials}
              </button>
            )
          })}
        </div>

        {/* C. Filter Popover (Priority, Status & Tags) */}
        <div className="tasks-popover-anchor" ref={filterRef}>
          <button
            type="button"
            className={`tasks-filter-btn${priorityFilter.length > 0 || statusFilter.length > 0 || tagFilter.length > 0 ? ' active' : ''}`}
            onClick={() => { setFilterOpen(v => !v); setSortOpen(false) }}
            title="Filter by priority, status, or tags"
          >
            <SlidersHorizontal size={12} strokeWidth={2} />
            <span>Filter</span>
            {(priorityFilter.length + statusFilter.length + tagFilter.length) > 0 && (
              <span className="tasks-filter-count-badge">
                {priorityFilter.length + statusFilter.length + tagFilter.length}
              </span>
            )}
            <ChevronDown size={10} strokeWidth={2} style={{ opacity: 0.6 }} />
          </button>

          {filterOpen && (
            <div className="tasks-filter-popover" onClick={e => e.stopPropagation()}>
              <div className="tasks-popover-section">
                <div className="tasks-popover-title">Priority</div>
                <div className="tasks-filter-pills">
                  {PRIORITY_ORDER.map(p => {
                    const cfg = PRIORITY_CONFIG[p]
                    const Icon = cfg.icon
                    const isSelected = priorityFilter.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`tasks-filter-pill${isSelected ? ' selected' : ''}`}
                        onClick={() => {
                          setPriorityFilter(prev =>
                            prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                          )
                        }}
                      >
                        <Icon size={11} strokeWidth={2} style={{ color: cfg.color }} />
                        <span>{cfg.label}</span>
                        {isSelected && <Check size={11} strokeWidth={3} style={{ marginLeft: 'auto', color: 'var(--accent-brand)' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="tasks-popover-divider" />

              <div className="tasks-popover-section">
                <div className="tasks-popover-title">Status</div>
                <div className="tasks-filter-pills">
                  {STATUS_ORDER.map(s => {
                    const cfg = STATUS_CONFIG[s]
                    const Icon = cfg.icon
                    const isSelected = statusFilter.includes(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`tasks-filter-pill${isSelected ? ' selected' : ''}`}
                        onClick={() => {
                          setStatusFilter(prev =>
                            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                          )
                        }}
                      >
                        <Icon size={11} strokeWidth={2} style={{ color: cfg.color }} />
                        <span>{cfg.label}</span>
                        {isSelected && <Check size={11} strokeWidth={3} style={{ marginLeft: 'auto', color: 'var(--accent-brand)' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="tasks-popover-divider" />

              <div className="tasks-popover-section">
                <div className="tasks-popover-title">Tags</div>
                <div className="tasks-filter-pills wrap">
                  {availableTags.map(tag => {
                    const cfg = getTagColor(tag)
                    const isSelected = tagFilter.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`tasks-filter-pill tag-pill${isSelected ? ' selected' : ''}`}
                        onClick={() => {
                          setTagFilter(prev =>
                            prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]
                          )
                        }}
                        style={{
                          backgroundColor: isSelected ? cfg.bg : 'var(--surface-hover)',
                          color: isSelected ? cfg.text : 'var(--text-secondary)',
                          borderColor: isSelected ? cfg.border : 'var(--border-subtle)',
                        }}
                      >
                        <Tag size={10} strokeWidth={2} />
                        <span>{tag}</span>
                        {isSelected && (
                          <Check size={11} strokeWidth={3} style={{ marginLeft: 'auto', color: cfg.text }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {(priorityFilter.length > 0 || statusFilter.length > 0 || tagFilter.length > 0) && (
                <div className="tasks-popover-footer">
                  <button
                    type="button"
                    className="tasks-popover-reset"
                    onClick={() => { setPriorityFilter([]); setStatusFilter([]); setTagFilter([]) }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* D. Sort Dropdown */}
        <div className="tasks-popover-anchor" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${sortBy !== 'default' ? ' active' : ''}`}
            onClick={() => { setSortOpen(v => !v); setFilterOpen(false) }}
            title="Sort tasks"
          >
            <ArrowUpDown size={12} strokeWidth={2} />
            <span>{getSortLabel(sortBy)}</span>
            <ChevronDown size={10} strokeWidth={2} style={{ opacity: 0.6 }} />
          </button>

          {sortOpen && (
            <div className="tasks-sort-dropdown" onClick={e => e.stopPropagation()}>
              <div className="tasks-popover-title" style={{ padding: '0.25rem 0.5rem' }}>Sort By</div>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`tasks-dropdown-option${sortBy === opt.key ? ' selected' : ''}`}
                  onClick={() => { setSortBy(opt.key); setSortOpen(false) }}
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.key && <Check size={11} strokeWidth={2.5} style={{ marginLeft: 'auto', color: 'var(--accent-brand)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* E. Active Filter Clear Action */}
        {isFiltered && (
          <button
            type="button"
            className="tasks-clear-filters-btn"
            onClick={handleClearAllFilters}
            title="Reset all filters and sorting"
          >
            <RotateCcw size={11} strokeWidth={2} />
            <span>Clear filters</span>
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Open channel cross-link */}
        {activeProjectId && (
          <button
            className="tasks-view-btn"
            onClick={handleOpenChannel}
            title="Open project channel in Chat"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3125rem',
              padding: '0.3125rem 0.625rem',
              marginRight: '0.625rem',
              fontSize: '0.75rem', fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-brand)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-brand)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)' }}
          >
            <MessageSquare size={12} strokeWidth={1.75} />
            <span>Open Channel</span>
          </button>
        )}

        {/* View tabs */}
        <div className="tasks-view-tabs">
          <button
            type="button"
            className={`tasks-view-tab${view === 'board' ? ' active' : ''}`}
            onClick={() => handleViewChange('board')}
            title="Board view"
          >
            <LayoutGrid size={12} strokeWidth={1.75} />
            <span>Board</span>
          </button>
          <button
            type="button"
            className={`tasks-view-tab${view === 'list' ? ' active' : ''}`}
            onClick={() => handleViewChange('list')}
            title="List view"
          >
            <List size={12} strokeWidth={1.75} />
            <span>List</span>
          </button>
          <button
            type="button"
            className="tasks-view-tab add-view"
            disabled
            title="More views coming soon"
          >
            <Plus size={11} strokeWidth={2.5} />
            <span>View</span>
          </button>
        </div>

        {/* New task button */}
        <button
          className="tasks-new-btn"
          onClick={() => { if (columns[0]) setCreateTaskCol(columns[0].id) }}
          disabled={columns.length === 0}
        >
          <Plus size={13} strokeWidth={2.5} />
          New Task
        </button>
      </div>

      {/* ── Loading ── */}
      {(projectsLoading || columnsLoading) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', color: 'var(--text-tertiary)' }}>
          <Loader2 size={18} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '0.875rem' }}>Loading…</span>
        </div>
      )}

      {/* ── Board view ── */}
      {!columnsLoading && view === 'board' && (
        <div className="kanban-board">
          <div className="kanban-columns">
            {columns.map(col => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={filteredTasksByColumn[col.id] ?? []}
                onAddTask={setCreateTaskCol}
                onSelectTask={handleSelectTask}
                onStatusChange={handleStatusChange}
                isFiltered={isFiltered}
                draggedTaskId={draggedTaskId}
                dragOverTarget={dragOverTarget}
                isDragOverCol={dragOverColId === col.id}
                onDragStartTask={handleDragStartTask}
                onDragEndTask={handleDragEndTask}
                onDragOverCard={handleDragOverCard}
                onDropOnCard={handleDropOnCard}
                onDragOverCol={handleDragOverCol}
                onDropOnCol={handleDropOnCol}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── List view (High-Density Status Table Grid) ── */}
      {!columnsLoading && view === 'list' && (
        <div className="tasks-list-view">
          {displayStages.map(stage => (
            <TaskTableStatusSection
              key={stage.status}
              stage={stage}
              tasks={tasksByStatus[stage.status] ?? []}
              isCollapsed={Boolean(collapsedSections[stage.status])}
              onToggleCollapse={() => toggleCollapse(stage.status)}
              onSelectTask={handleSelectTask}
              onToggleDone={(t) => handleStatusChange(t.id, t.status === 'DONE' ? 'TODO' : 'DONE')}
              isAdding={addingSection === stage.status}
              onStartAdd={() => {
                setAddingSection(stage.status)
                if (collapsedSections[stage.status]) {
                  setCollapsedSections(prev => ({ ...prev, [stage.status]: false }))
                }
              }}
              onCancelAdd={() => {
                setAddingSection(null)
                setInlineTitleByStatus(prev => ({ ...prev, [stage.status]: '' }))
              }}
              inlineTitle={inlineTitleByStatus[stage.status] ?? ''}
              onInlineTitleChange={(val) => setInlineTitleByStatus(prev => ({ ...prev, [stage.status]: val }))}
              onSubmitInlineAdd={() => handleInlineCreateTask(stage.status)}
            />
          ))}
        </div>
      )}

      {/* ── Task Detail Drawer ── */}
      {selectedTask && (() => {
        const proj = projects.find(p => p.id === (selectedTask.projectId || activeProjectId))
        return (
          <TaskDetailDrawer
            task={selectedTask}
            projectName={proj?.name ?? 'Project'}
            onClose={handleCloseDrawer}
          />
        )
      })()}

      {/* ── Create Task Modal ── */}
      {createTaskCol && activeProjectId && (
        <CreateTaskModal
          projectId={activeProjectId}
          columnId={createTaskCol}
          columns={columns}
          onClose={() => setCreateTaskCol(null)}
          onCreated={() => {}}
        />
      )}

      {/* ── Create Project Modal ── */}
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={(id) => setActiveProject(id)}
        />
      )}
    </div>
  )
}
