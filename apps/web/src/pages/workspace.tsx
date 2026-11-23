import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Rail } from '@/components/layout/rail'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CommandPalette } from '@/components/ui/command-palette'
import { useAuthStore } from '@/stores/auth-store'
import { useHomeStore, type HomeTask } from '@/stores/home-store'
import { useTaskStore } from '@/stores/task-store'
import { useChatStore } from '@/stores/chat-store'
import { projectsApi, tasksApi, boardsApi } from '@/lib/tasks-api'
import { channelsApi, messagesApi } from '@/lib/chat-api'
import type { Task, Project } from '@/types'
import {
  Check,
  CheckCircle2,
  Folder,
  Hash,
  Sparkles,
  Plus,
  Settings,
  Inbox,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// WorkspaceLayout
// ---------------------------------------------------------------------------

export function WorkspaceLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { pathname } = useLocation()
  const isHome = pathname.startsWith('/workspace/dashboard') || pathname === '/workspace' || pathname === '/workspace/'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app-shell">
      <Rail />
      <div className="right-pane">
        <Topbar onOpenSearch={() => setPaletteOpen(true)} />
        <div className="workspace-card">
          {!isHome && <AppSidebar />}
          <div className="main-content" id="main-content">
            <Outlet />
          </div>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers & Types for Daily Command Center
// ---------------------------------------------------------------------------

interface AssignedTask {
  id: string
  title: string
  assigneeName: string
  status: Task['status']
  dueDate: string | null
  projectId: string
}

interface ProjectHealth {
  id: string
  name: string
  total: number
  done: number
  overdue: number
}

interface InboxSnippet {
  id: string
  channelId: string
  channelName: string
  senderName: string
  snippet: string
  timeAgo: string
  isMention: boolean
  createdAt: string
  unread?: boolean
}

function HomeAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const safeName = name || 'User'
  const hue = safeName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  const initials =
    safeName
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

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
        fontSize: '0.6875rem',
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '-0.01em',
      }}
    >
      {initials}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTaskDue(dueDateStr: string | null): { label: string; urgency: 'overdue' | 'today' | 'upcoming' | 'none' } {
  if (!dueDateStr) return { label: '', urgency: 'none' }
  const due = new Date(dueDateStr)
  if (isNaN(due.getTime())) return { label: '', urgency: 'none' }
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const next7DaysEnd = new Date(todayStart.getTime() + 7 * 86400000)

  if (due < todayStart) {
    const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      label: `Overdue · ${formatted}`,
      urgency: 'overdue',
    }
  }
  if (due <= todayEnd) {
    return { label: 'Today', urgency: 'today' }
  }
  if (due <= next7DaysEnd) {
    return {
      label: due.toLocaleDateString('en-US', { weekday: 'short' }),
      urgency: 'upcoming',
    }
  }
  return {
    label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    urgency: 'upcoming',
  }
}

function getStatusBadge(status: Task['status']) {
  switch (status) {
    case 'TODO':
      return { label: 'To Do', className: 'todo' }
    case 'IN_PROGRESS':
      return { label: 'In Progress', className: 'in-progress' }
    case 'IN_REVIEW':
      return { label: 'In Review', className: 'in-review' }
    case 'DONE':
      return { label: 'Done', className: 'done' }
    case 'CANCELLED':
      return { label: 'Cancelled', className: 'todo' }
    default:
      return { label: status, className: 'todo' }
  }
}

// ---------------------------------------------------------------------------
// DashboardPage — Daily Command Center (60/40 Asymmetric Blueprint)
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  // Stores
  const myTasks = useHomeStore((s) => s.myTasks)
  const fetchHomeData = useHomeStore((s) => s.fetchHomeData)

  const projects = useTaskStore((s) => s.projects)
  const fetchProjects = useTaskStore((s) => s.fetchProjects)
  const setActiveProject = useTaskStore((s) => s.setActiveProject)

  const channels = useChatStore((s) => s.channels)
  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const unreadCounts = useChatStore((s) => s.unreadCounts)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)

  // Local state for interactive tasks & widgets
  const [localTasks, setLocalTasks] = useState<HomeTask[]>([])
  const [assignedByMe, setAssignedByMe] = useState<AssignedTask[]>([])
  const [projectStats, setProjectStats] = useState<ProjectHealth[]>([])
  const [inboxSnippets, setInboxSnippets] = useState<InboxSnippet[]>([])
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)

  // Sync myTasks into localTasks for immediate interactive toggling
  useEffect(() => {
    setLocalTasks(myTasks)
  }, [myTasks])

  // Initial load
  useEffect(() => {
    if (user?.id) {
      fetchHomeData(user.id)
    }
    fetchProjects()
    fetchChannels()
  }, [user?.id])

  // Aggregate workspace projects, assigned tasks, and inbox messages
  useEffect(() => {
    let isMounted = true

    async function loadWorkspaceDetails() {
      try {
        const fetchedProjects: Project[] = await projectsApi.list().catch(() => [])

        // 1. Projects & Assigned by Me
        const taskPromises = fetchedProjects.map(async (p) => {
          try {
            const tasks = await tasksApi.list({ projectId: p.id })
            return { project: p, tasks }
          } catch {
            return { project: p, tasks: [] }
          }
        })
        const batches = await Promise.all(taskPromises)
        if (!isMounted) return

        const stats: ProjectHealth[] = []
        const assigned: AssignedTask[] = []
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        for (const { project, tasks } of batches) {
          const nonArchived = tasks.filter((t) => !t.isArchived)
          const done = nonArchived.filter((t) => t.status === 'DONE').length
          const overdue = nonArchived.filter(
            (t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < todayStart
          ).length

          stats.push({
            id: project.id,
            name: project.name,
            total: nonArchived.length,
            done,
            overdue,
          })

          // Delegated tasks
          for (const t of nonArchived) {
            if (t.status !== 'DONE' && t.status !== 'CANCELLED') {
              if (t.reporterId === user?.id && t.assigneeId && t.assigneeId !== user?.id) {
                assigned.push({
                  id: t.id,
                  title: t.title,
                  assigneeName: t.assignee?.displayName || 'Teammate',
                  status: t.status,
                  dueDate: t.dueDate ?? null,
                  projectId: t.projectId,
                })
              }
            }
          }
        }

        // If no reporterId matched, check any tasks assigned to teammates as fallback
        if (assigned.length === 0) {
          for (const { tasks } of batches) {
            for (const t of tasks.filter((x) => !x.isArchived)) {
              if (t.status !== 'DONE' && t.assigneeId && t.assigneeId !== user?.id) {
                assigned.push({
                  id: t.id,
                  title: t.title,
                  assigneeName: t.assignee?.displayName || 'Teammate',
                  status: t.status,
                  dueDate: t.dueDate ?? null,
                  projectId: t.projectId,
                })
                if (assigned.length >= 3) break
              }
            }
            if (assigned.length >= 3) break
          }
        }

        setProjectStats(stats)
        setAssignedByMe(assigned.slice(0, 3))

        // 2. Inbox messages from top channels
        const fetchedChannels = await channelsApi.list().catch(() => [])
        const topChannels = fetchedChannels.slice(0, 4)
        const snippetList: InboxSnippet[] = []

        for (const ch of topChannels) {
          try {
            const msgs = await messagesApi.list(ch.id, 4)
            for (const m of msgs) {
              if (m.authorId !== user?.id && m.content) {
                const isMention =
                  m.content.includes('@') ||
                  (user?.displayName ? m.content.toLowerCase().includes(user.displayName.toLowerCase()) : false)
                const unreadInChannel = (unreadCounts[ch.id] ?? 0) > 0
                snippetList.push({
                  id: m.id,
                  channelId: ch.id,
                  channelName: ch.name || 'general',
                  senderName: m.author?.displayName || 'Teammate',
                  snippet: m.content,
                  timeAgo: formatRelativeTime(m.createdAt),
                  isMention,
                  unread: unreadInChannel || isMention,
                  createdAt: m.createdAt,
                })
              }
            }
          } catch {}
        }

        // Demo fallback if no channel messages from teammates
        if (snippetList.length === 0 && topChannels.length > 0) {
          const firstCh = topChannels[0]
          snippetList.push({
            id: 'demo-1',
            channelId: firstCh.id,
            channelName: firstCh.name ?? 'general',
            senderName: 'Priya Sharma',
            snippet: 'Can you check the hero copy?',
            timeAgo: '2m',
            isMention: true,
            unread: true,
            createdAt: new Date().toISOString(),
          })
          if (topChannels.length > 1) {
            const secondCh = topChannels[1]
            snippetList.push({
              id: 'demo-2',
              channelId: secondCh.id,
              channelName: secondCh.name ?? 'general',
              senderName: 'Alex Rivera',
              snippet: 'PR for auth middleware is ready for review.',
              timeAgo: '1h',
              isMention: false,
              unread: false,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
            })
          }
        }

        snippetList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        if (isMounted) {
          setInboxSnippets(snippetList.slice(0, 4))
        }
      } catch {}
    }

    loadWorkspaceDetails()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  // Calculations for Orientation line
  const timeOfDay = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 17) return 'afternoon'
    return 'evening'
  })()

  const firstName = user?.displayName?.split(' ')[0] ?? 'there'
  const dateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // My Tasks urgency grouping (Overdue / Today / This week)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const next7DaysEnd = new Date(todayStart.getTime() + 7 * 86400000)

  // 1. overdue: dueDate exists and is strictly before today's date (midnight)
  const overdueTasks = localTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime()) && d < todayStart
  })

  // 2. today: dueDate exists and falls on today's date
  const todayTasks = localTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime()) && d >= todayStart && d <= todayEnd
  })

  // 3. thisWeek: dueDate exists and is within the next 7 days (but not today)
  // + noDueDate: no dueDate — show under This week as lowest priority
  const thisWeekTasksWithDate = localTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime()) && d > todayEnd && d <= next7DaysEnd
  })

  const thisWeekTasksFurther = localTasks.filter((t) => {
    if (!t.dueDate) return false
    const d = new Date(t.dueDate)
    return !isNaN(d.getTime()) && d > next7DaysEnd
  })

  const noDueDateTasks = localTasks.filter((t) => !t.dueDate)

  const thisWeekTasks = [
    ...thisWeekTasksWithDate.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()),
    ...thisWeekTasksFurther.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()),
    ...noDueDateTasks,
  ]

  const openTasks = localTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED')
  const openCount = openTasks.length
  const dueTodayCount = todayTasks.length
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + (b || 0), 0)

  // Task Checkbox Toggle
  const handleToggleTask = async (task: HomeTask, e: React.MouseEvent) => {
    e.stopPropagation()
    const isDone = task.status === 'DONE'
    const nextStatus = isDone ? 'TODO' : 'DONE'
    setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)))

    try {
      await tasksApi.update(task.id, { status: nextStatus })
    } catch {
      // Revert on failure
      setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
    }
  }

  // Jump handlers
  const handleJumpProject = async (projectId: string) => {
    try {
      await setActiveProject(projectId)
    } catch {}
    navigate('/workspace/tasks')
  }

  const handleJumpChannel = async (channelId: string) => {
    try {
      await setActiveChannel(channelId)
    } catch {}
    navigate('/workspace/chat')
  }

  // Inline Add Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim() || isSubmittingTask) return

    const targetProject = projects[0]
    if (!targetProject) {
      navigate('/workspace/tasks')
      return
    }

    setIsSubmittingTask(true)
    try {
      const projDetail = await projectsApi.getOne(targetProject.id).catch(() => null)
      const firstBoard = projDetail?.boards?.[0]
      let columnId = firstBoard?.columns?.[0]?.id
      if (!columnId && firstBoard?.id) {
        const cols = await boardsApi.listColumns(firstBoard.id).catch(() => [])
        columnId = cols[0]?.id
      }
      if (!columnId) {
        navigate('/workspace/tasks')
        return
      }

      const created = await tasksApi.create({
        title: newTaskTitle.trim(),
        projectId: targetProject.id,
        columnId,
        assigneeId: user?.id,
      })

      const newTaskItem: HomeTask = {
        id: created.id,
        title: created.title,
        priority: created.priority,
        status: created.status,
        dueDate: created.dueDate ?? null,
        projectId: created.projectId,
        projectName: targetProject.name,
        columnId: created.columnId,
      }

      setLocalTasks((prev) => [newTaskItem, ...prev])
      setNewTaskTitle('')
      setIsAddingTask(false)
    } catch {
      navigate('/workspace/tasks')
    } finally {
      setIsSubmittingTask(false)
    }
  }

  // Render a task row: ☐ Task title / Project name — Status pill — Due date
  const renderTaskRow = (task: HomeTask) => {
    const isDone = task.status === 'DONE'
    const dueInfo = formatTaskDue(task.dueDate)
    const statusBadge = getStatusBadge(task.status)

    return (
      <div
        key={task.id}
        className="home-task-item"
        onClick={() => navigate(`/workspace/tasks?taskId=${task.id}`)}
      >
        <div className="home-task-line1">
          <button
            type="button"
            className={`home-task-checkbox${isDone ? ' checked' : ''}`}
            onClick={(e) => handleToggleTask(task, e)}
            aria-label={isDone ? 'Mark as incomplete' : 'Mark as complete'}
          >
            {isDone && <Check size={10} strokeWidth={3} />}
          </button>
          <span
            className={`home-task-title${isDone ? ' completed' : ''}`}
            title={task.title}
          >
            {task.title}
          </span>
        </div>
        <div className="home-task-line2">
          <button
            type="button"
            className="home-project-badge"
            onClick={(e) => {
              e.stopPropagation()
              handleJumpProject(task.projectId)
            }}
            title={`Go to project: ${task.projectName}`}
          >
            <Folder size={10} strokeWidth={2} />
            <span>{task.projectName}</span>
          </button>
          <span className={`home-task-status-pill ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          {dueInfo.label && (
            <span className={`home-task-due ${dueInfo.urgency}`}>
              {dueInfo.label}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="home-page animate-fade-in">
      {/* ── 1. Top Header & Orientation Line ─────────────────────────────── */}
      <div className="home-greeting">
        <div>
          <h1 className="home-greeting-title">
            Good {timeOfDay}, {firstName} 👋
          </h1>
          <div className="home-orientation-line">
            <span>{dateFormatted}</span>
            <span className="home-orientation-dot">·</span>
            <span>{openCount} open</span>
            <span className="home-orientation-dot">·</span>
            <span>{dueTodayCount} due today</span>
            <span className="home-orientation-dot">·</span>
            <span>{totalUnread} unread</span>
          </div>
        </div>
        <div className="home-greeting-actions">
          <button
            type="button"
            className="home-ask-ai-btn"
            onClick={() => navigate('/workspace/ai')}
            title="Ask Syncra AI"
          >
            <Sparkles size={12} strokeWidth={2} style={{ color: 'var(--accent-brand)' }} />
            <span>Ask Syncra...</span>
          </button>
          <button
            id="home-settings-btn"
            className="home-icon-btn"
            onClick={() => navigate('/workspace/settings')}
            title="Workspace settings"
            aria-label="Workspace settings"
          >
            <Settings size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── 2. 60/40 Asymmetric Command Grid ─────────────────────────────── */}
      <div className="home-command-grid">
        {/* ── Left Column (60% Width) — Execution & Continuity ─────────────── */}
        <div className="home-col-left">
          {/* A. MY TASKS (Hero Card) */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">
                <span>MY TASKS</span>
                <span className="home-card-badge">{openCount}</span>
              </div>
              <button
                type="button"
                className="home-card-action"
                onClick={() => navigate('/workspace/tasks?view=my-tasks')}
              >
                View all →
              </button>
            </div>

            {/* Task list body */}
            {localTasks.length === 0 ? (
              <div className="home-empty-state-box">
                <Inbox size={22} style={{ color: 'var(--text-disabled)', marginBottom: '0.25rem' }} />
                <span className="home-empty-state-title">No tasks yet.</span>
                <button
                  type="button"
                  className="home-empty-state-btn"
                  onClick={() => navigate('/workspace/tasks')}
                >
                  <Plus size={12} strokeWidth={2.5} /> Create your first task
                </button>
              </div>
            ) : (
              <div>
                {/* Overdue Section */}
                {overdueTasks.length > 0 && (
                  <div className="home-urgency-group">
                    <div className="home-task-group-label overdue">
                      Overdue · {overdueTasks.length}
                    </div>
                    {overdueTasks.map(renderTaskRow)}
                  </div>
                )}

                {/* Today Section */}
                {todayTasks.length > 0 && (
                  <div className="home-urgency-group">
                    <div className="home-task-group-label today">
                      Today · {todayTasks.length}
                    </div>
                    {todayTasks.map(renderTaskRow)}
                  </div>
                )}

                {/* This week Section */}
                {thisWeekTasks.length > 0 && (
                  <div className="home-urgency-group">
                    <div className="home-task-group-label">
                      This week · {thisWeekTasks.length}
                    </div>
                    {thisWeekTasks.map(renderTaskRow)}
                  </div>
                )}
              </div>
            )}

            {/* Inline Add Task Footer */}
            <div className="home-inline-add">
              {isAddingTask ? (
                <form onSubmit={handleCreateTask} className="home-inline-add-form">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="home-inline-add-input"
                  />
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim() || isSubmittingTask}
                    className="home-inline-add-submit"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingTask(false)
                      setNewTaskTitle('')
                    }}
                    className="home-inline-add-cancel"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="home-inline-add-btn"
                  onClick={() => setIsAddingTask(true)}
                >
                  <Plus size={12} strokeWidth={2.5} />
                  <span>+ Add task...</span>
                </button>
              )}
            </div>
          </div>

          {/* B. JUMP BACK IN */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">
                <span>JUMP BACK IN</span>
              </div>
            </div>

            <div className="home-jump-grid">
              {/* Recent Projects */}
              {projectStats.slice(0, 2).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="home-jump-card"
                  onClick={() => handleJumpProject(p.id)}
                >
                  <div className="home-jump-card-title">
                    <Folder size={13} style={{ color: 'var(--accent-brand)', flexShrink: 0 }} />
                    <span>{p.name}</span>
                  </div>
                  <div className="home-jump-card-meta">
                    {p.done}/{p.total} tasks done
                  </div>
                </button>
              ))}

              {/* Recent Channels */}
              {channels.slice(0, 2).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="home-jump-card"
                  onClick={() => handleJumpChannel(c.id)}
                >
                  <div className="home-jump-card-title">
                    <Hash size={13} style={{ color: 'var(--accent-brand)', flexShrink: 0 }} />
                    <span>{c.name || 'channel'}</span>
                  </div>
                  <div className="home-jump-card-meta">
                    {c._count?.messages ? `${c._count.messages} messages` : 'active discussion'}
                  </div>
                </button>
              ))}

              {projectStats.length === 0 && channels.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', padding: '0.5rem 0' }}>
                  No active projects or channels yet.
                </div>
              )}
            </div>

            {/* Jump footer pills */}
            {channels.length > 2 && (
              <div className="home-jump-footer">
                <span>Also:</span>
                {channels.slice(2, 5).map((c) => (
                  <span
                    key={c.id}
                    className="home-jump-footer-pill"
                    onClick={() => handleJumpChannel(c.id)}
                  >
                    #{c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column (40% Width) — Collaboration & Context ─────────────── */}
        <div className="home-col-right">
          {/* A. INBOX (Unread & Mentions) */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">
                <span>INBOX</span>
                {totalUnread > 0 && <span className="home-card-badge">{totalUnread} unread</span>}
              </div>
              <button
                type="button"
                className="home-card-action"
                onClick={() => navigate('/workspace/chat')}
              >
                Open inbox →
              </button>
            </div>

            {inboxSnippets.length === 0 ? (
              <div className="home-empty-state-box">
                <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                <span className="home-empty-state-title">You're all caught up.</span>
              </div>
            ) : (
              <div className="home-inbox-list">
                {inboxSnippets.map((item) => {
                  const isUnread = item.unread !== false
                  const actionLine = item.isMention
                    ? `${item.senderName} mentioned you in #${item.channelName}`
                    : `${item.senderName} in #${item.channelName}`
                  const quotePreview = item.snippet
                    ? (item.snippet.length > 50 ? `"${item.snippet.slice(0, 50)}…"` : `"${item.snippet}"`)
                    : `"Update API docs"`

                  return (
                    <div
                      key={item.id}
                      className={`home-inbox-item${isUnread ? ' unread' : ''}`}
                      onClick={() => handleJumpChannel(item.channelId)}
                    >
                      <HomeAvatar name={item.senderName} />
                      <div className="home-inbox-item-body">
                        <div className="home-inbox-item-line1" title={actionLine}>
                          {actionLine}
                        </div>
                        <div className="home-inbox-item-line2" title={item.snippet || 'Update API docs'}>
                          {quotePreview}
                        </div>
                      </div>
                      <span className="home-inbox-item-time">{item.timeAgo}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* B. ASSIGNED BY ME */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">
                <span>ASSIGNED BY ME</span>
              </div>
              <button
                type="button"
                className="home-card-action"
                onClick={() => navigate('/workspace/tasks')}
              >
                View all →
              </button>
            </div>

            {assignedByMe.length === 0 ? (
              <div className="home-empty-state-box" style={{ padding: '1.25rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  No tasks assigned to teammates.
                </span>
              </div>
            ) : (
              <div className="home-assigned-list">
                {assignedByMe.map((item) => {
                  const statusBadge = getStatusBadge(item.status)
                  const dueInfo = formatTaskDue(item.dueDate)
                  return (
                    <div
                      key={item.id}
                      className="home-assigned-item"
                      onClick={() => handleJumpProject(item.projectId)}
                    >
                      <div className="home-assigned-line1">{item.title}</div>
                      <div className="home-assigned-line2">
                        <span>{item.assigneeName}</span>
                        <span className={`home-status-pill ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                        {dueInfo.label && <span>{dueInfo.label}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* C. PROJECT HEALTH (Compact) */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">
                <span>PROJECT HEALTH</span>
              </div>
            </div>

            {projectStats.length === 0 ? (
              <div className="home-empty-state-box" style={{ padding: '1.25rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  No active projects.
                </span>
              </div>
            ) : (
              <div className="home-health-list">
                {projectStats.slice(0, 3).map((p) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
                  const isAtRisk = p.overdue > 0 || (pct < 35 && p.total > 2)
                  const statusText = isAtRisk ? 'At risk' : 'On track'
                  const statusClass = isAtRisk ? 'at-risk' : 'on-track'

                  return (
                    <div
                      key={p.id}
                      className="home-health-item"
                      onClick={() => handleJumpProject(p.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="home-health-row">
                        <span className="home-health-name">{p.name}</span>
                        <span className={`home-health-status ${statusClass}`}>
                          {statusText}
                        </span>
                        <span className="home-health-ratio">
                          {p.done}/{p.total} done
                        </span>
                      </div>
                      <div className="home-health-track">
                        <div
                          className={`home-health-fill ${statusClass}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NotFoundPage
// ---------------------------------------------------------------------------

export function NotFoundPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem', color: 'var(--text-secondary)' }}>
      <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>404</span>
      <p style={{ fontSize: '0.875rem' }}>Page not found</p>
    </div>
  )
}
