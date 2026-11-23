import { create } from 'zustand'
import { projectsApi, tasksApi, boardsApi } from '@/lib/tasks-api'
import type { Project, Task, Board, Column, CreateTaskInput, UpdateTaskInput } from '@/types'

// ---------------------------------------------------------------------------
// Subtask & Comment types
// ---------------------------------------------------------------------------

export interface TaskSubtask {
  id: string
  title: string
  done: boolean
}

export interface TaskComment {
  id: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
  isSystem?: boolean
}

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

function loadSubtasksFromStorage(taskId: string): TaskSubtask[] {
  try {
    const raw = localStorage.getItem(`task_subtasks_${taskId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSubtasksToStorage(taskId: string, subtasks: TaskSubtask[]) {
  try {
    localStorage.setItem(`task_subtasks_${taskId}`, JSON.stringify(subtasks))
  } catch {}
}

function loadCommentsFromStorage(taskId: string, fallback?: TaskComment): TaskComment[] {
  try {
    const raw = localStorage.getItem(`task_comments_${taskId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return fallback ? [fallback] : []
}

function saveCommentsToStorage(taskId: string, comments: TaskComment[]) {
  try {
    localStorage.setItem(`task_comments_${taskId}`, JSON.stringify(comments))
  } catch {}
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface TaskState {
  // Projects
  projects:         Project[]
  projectsLoading:  boolean
  projectsError:    string | null

  // Active project + board
  activeProjectId:  string | null
  activeBoard:      Board | null
  columns:          Column[]
  columnsLoading:   boolean

  // Tasks (keyed by columnId for quick lookup)
  tasksByColumn:    Record<string, Task[]>
  tasksLoading:     boolean
  tasksError:       string | null

  // Task detail panel / drawer
  selectedTask:     Task | null

  // Local subtasks and comments map
  subtasksByTask:   Record<string, TaskSubtask[]>
  commentsByTask:   Record<string, TaskComment[]>

  // Actions
  fetchProjects:    () => Promise<void>
  setActiveProject: (projectId: string) => Promise<void>
  fetchTasks:       (projectId: string, filters?: { assigneeId?: string; priority?: string; status?: string }) => Promise<void>
  fetchTaskById:    (taskId: string) => Promise<Task | null>

  createTask:       (data: CreateTaskInput) => Promise<Task>
  updateTask:       (taskId: string, data: UpdateTaskInput) => Promise<Task>
  moveTask:         (taskId: string, fromColumnId: string, toColumnId: string, position: number) => Promise<void>
  deleteTask:       (taskId: string, columnId: string) => Promise<void>

  selectTask:       (task: Task | null) => void
  createProject:    (data: { name: string; description?: string }) => Promise<Project>

  // Subtasks actions
  getSubtasks:      (taskId: string) => TaskSubtask[]
  addSubtask:       (taskId: string, title: string) => TaskSubtask
  toggleSubtask:    (taskId: string, subtaskId: string) => void
  deleteSubtask:    (taskId: string, subtaskId: string) => void

  // Comments actions
  getComments:      (taskId: string, initialSysComment?: { authorId: string; authorName: string; createdAt: string }) => TaskComment[]
  addComment:       (taskId: string, comment: { authorId: string; authorName: string; content: string; isSystem?: boolean }) => TaskComment
}

// ---------------------------------------------------------------------------
// Helper: group tasks by columnId
// ---------------------------------------------------------------------------
function groupByColumn(tasks: Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {}
  for (const task of tasks) {
    if (!map[task.columnId]) map[task.columnId] = []
    map[task.columnId].push(task)
  }
  // Sort each column by position
  for (const colId in map) {
    map[colId].sort((a, b) => a.position - b.position)
  }
  return map
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useTaskStore = create<TaskState>((set, get) => ({
  projects:        [],
  projectsLoading: false,
  projectsError:   null,

  activeProjectId: null,
  activeBoard:     null,
  columns:         [],
  columnsLoading:  false,

  tasksByColumn:   {},
  tasksLoading:    false,
  tasksError:      null,

  selectedTask:    null,

  subtasksByTask:  {},
  commentsByTask:  {},

  // ── Projects ──────────────────────────────────────────────────────────────

  fetchProjects: async () => {
    set({ projectsLoading: true, projectsError: null })
    try {
      const projects = await projectsApi.list()
      set({ projects, projectsLoading: false })
    } catch (e: any) {
      set({ projectsLoading: false, projectsError: e?.response?.data?.error ?? 'Failed to load projects' })
    }
  },

  setActiveProject: async (projectId: string) => {
    set({ activeProjectId: projectId, columnsLoading: true, tasksByColumn: {} })
    try {
      const project = await projectsApi.getOne(projectId)
      const board   = project.boards?.[0] ?? null
      if (board) {
        const columns = await boardsApi.listColumns(board.id)
        const tasks   = await tasksApi.list({ projectId })
        set({
          activeBoard:    board,
          columns:        columns.sort((a, b) => a.position - b.position),
          tasksByColumn:  groupByColumn(tasks),
          columnsLoading: false,
          tasksLoading:   false,
        })
      } else {
        set({ activeBoard: null, columns: [], columnsLoading: false })
      }
    } catch {
      set({ columnsLoading: false })
    }
  },

  fetchTasks: async (projectId, filters) => {
    set({ tasksLoading: true, tasksError: null })
    try {
      const tasks = await tasksApi.list({ projectId, ...filters })
      set({ tasksByColumn: groupByColumn(tasks), tasksLoading: false })
    } catch (e: any) {
      set({ tasksLoading: false, tasksError: e?.response?.data?.error ?? 'Failed to load tasks' })
    }
  },

  fetchTaskById: async (taskId: string) => {
    try {
      const task = await tasksApi.getOne(taskId)
      // Check if task exists in current columns, if not update or set
      set((s) => {
        const col = task.columnId
        const existing = (s.tasksByColumn[col] ?? []).find((t) => t.id === taskId)
        if (existing) {
          return {
            tasksByColumn: {
              ...s.tasksByColumn,
              [col]: (s.tasksByColumn[col] ?? []).map((t) => (t.id === taskId ? task : t)),
            },
          }
        }
        return s
      })
      return task
    } catch {
      return null
    }
  },

  // ── Task CRUD ─────────────────────────────────────────────────────────────

  createTask: async (data) => {
    const task = await tasksApi.create(data)
    set((s) => ({
      tasksByColumn: {
        ...s.tasksByColumn,
        [task.columnId]: [...(s.tasksByColumn[task.columnId] ?? []), task].sort((a, b) => a.position - b.position),
      },
    }))
    return task
  },

  updateTask: async (taskId, data) => {
    const updated = await tasksApi.update(taskId, data)
    set((s) => {
      // Find where task was originally
      let oldColId = updated.columnId
      for (const [colId, list] of Object.entries(s.tasksByColumn)) {
        if (list.some((t) => t.id === taskId)) {
          oldColId = colId
          break
        }
      }
      const newColId = updated.columnId
      if (oldColId !== newColId) {
        return {
          tasksByColumn: {
            ...s.tasksByColumn,
            [oldColId]: (s.tasksByColumn[oldColId] ?? []).filter((t) => t.id !== taskId),
            [newColId]: [...(s.tasksByColumn[newColId] ?? []), updated].sort((a, b) => a.position - b.position),
          },
          selectedTask: s.selectedTask?.id === taskId ? updated : s.selectedTask,
        }
      }
      return {
        tasksByColumn: {
          ...s.tasksByColumn,
          [newColId]: (s.tasksByColumn[newColId] ?? []).map((t) => (t.id === taskId ? updated : t)),
        },
        selectedTask: s.selectedTask?.id === taskId ? updated : s.selectedTask,
      }
    })
    return updated
  },

  moveTask: async (taskId, fromColumnId, toColumnId, position) => {
    // Optimistic update
    set((s) => {
      const task = (s.tasksByColumn[fromColumnId] ?? []).find((t) => t.id === taskId)
      if (!task) return s
      const updated = { ...task, columnId: toColumnId, position }
      const fromList = (s.tasksByColumn[fromColumnId] ?? []).filter((t) => t.id !== taskId)
      const toList   = toColumnId === fromColumnId ? fromList : [...(s.tasksByColumn[toColumnId] ?? [])]
      toList.push(updated)
      toList.sort((a, b) => a.position - b.position)
      return {
        tasksByColumn: {
          ...s.tasksByColumn,
          [fromColumnId]: fromList,
          [toColumnId]:   toList,
        },
      }
    })
    // Persist
    await tasksApi.move(taskId, { columnId: toColumnId !== fromColumnId ? toColumnId : undefined, position })
  },

  deleteTask: async (taskId, columnId) => {
    set((s) => ({
      tasksByColumn: {
        ...s.tasksByColumn,
        [columnId]: (s.tasksByColumn[columnId] ?? []).filter((t) => t.id !== taskId),
      },
      selectedTask: s.selectedTask?.id === taskId ? null : s.selectedTask,
    }))
    await tasksApi.delete(taskId)
  },

  selectTask: (task) => set({ selectedTask: task }),

  createProject: async (data) => {
    const project = await projectsApi.create(data)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  // ── Subtasks Support ──────────────────────────────────────────────────────

  getSubtasks: (taskId) => {
    const current = get().subtasksByTask[taskId]
    if (current) return current
    const loaded = loadSubtasksFromStorage(taskId)
    set((s) => ({
      subtasksByTask: { ...s.subtasksByTask, [taskId]: loaded },
    }))
    return loaded
  },

  addSubtask: (taskId, title) => {
    const newSubtask: TaskSubtask = {
      id: Math.random().toString(36).slice(2, 9),
      title: title.trim(),
      done: false,
    }
    const current = get().getSubtasks(taskId)
    const updated = [...current, newSubtask]
    saveSubtasksToStorage(taskId, updated)
    set((s) => ({
      subtasksByTask: { ...s.subtasksByTask, [taskId]: updated },
    }))
    return newSubtask
  },

  toggleSubtask: (taskId, subtaskId) => {
    const current = get().getSubtasks(taskId)
    const updated = current.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s))
    saveSubtasksToStorage(taskId, updated)
    set((s) => ({
      subtasksByTask: { ...s.subtasksByTask, [taskId]: updated },
    }))
  },

  deleteSubtask: (taskId, subtaskId) => {
    const current = get().getSubtasks(taskId)
    const updated = current.filter((s) => s.id !== subtaskId)
    saveSubtasksToStorage(taskId, updated)
    set((s) => ({
      subtasksByTask: { ...s.subtasksByTask, [taskId]: updated },
    }))
  },

  // ── Comments Support ──────────────────────────────────────────────────────

  getComments: (taskId, initialSysComment) => {
    const current = get().commentsByTask[taskId]
    if (current) return current
    const fallbackComment = initialSysComment ? {
      id: 'sys-init',
      authorId: initialSysComment.authorId,
      authorName: initialSysComment.authorName,
      content: 'created this task',
      createdAt: initialSysComment.createdAt,
      isSystem: true,
    } : undefined
    const loaded = loadCommentsFromStorage(taskId, fallbackComment)
    set((s) => ({
      commentsByTask: { ...s.commentsByTask, [taskId]: loaded },
    }))
    return loaded
  },

  addComment: (taskId, comment) => {
    const newComment: TaskComment = {
      id: Math.random().toString(36).slice(2, 9),
      authorId: comment.authorId,
      authorName: comment.authorName,
      content: comment.content,
      createdAt: new Date().toISOString(),
      isSystem: comment.isSystem,
    }
    const current = get().commentsByTask[taskId] ?? loadCommentsFromStorage(taskId)
    const updated = [...current, newComment]
    saveCommentsToStorage(taskId, updated)
    set((s) => ({
      commentsByTask: { ...s.commentsByTask, [taskId]: updated },
    }))
    return newComment
  },
}))

