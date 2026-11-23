/**
 * home-store.ts — Home page data aggregation
 *
 * ARCHITECTURE NOTE
 * ─────────────────
 * The backend's GET /tasks endpoint requires a projectId (see taskFilterSchema).
 * There is no workspace-wide task listing endpoint. To produce workspace-level
 * statistics, this store iterates across all fetched projects and aggregates
 * their tasks in memory on the frontend.
 *
 * This is intentional and correct — it mirrors the project-first data model
 * and avoids any backend changes.
 *
 * ACTIVITY FEED
 * ─────────────
 * The audit module (AuditService) is write-only and has no read HTTP endpoint.
 * TaskHistory is stored in the DB but has no dedicated frontend read route.
 * Chat messages are per-channel and not suitable for a cross-channel feed.
 * Result: no truthful activity feed can be composed from existing APIs.
 * The Home page will show an honest "not yet available" state.
 */

import { create } from 'zustand'
import { projectsApi, tasksApi } from '@/lib/tasks-api'
import type { Task, Project } from '@/types'

// ---------------------------------------------------------------------------
// Derived workspace overview stats — entirely computed from real Task fields
// ---------------------------------------------------------------------------

export interface WorkspaceOverviewStats {
  /** Non-archived tasks by TaskStatus value */
  todo:       number
  inProgress: number
  inReview:   number
  done:       number
  cancelled:  number
  /** urgent-priority non-archived tasks (needs immediate attention) */
  attention:  number
  /** tasks with assigneeId === null */
  unassigned: number
  /** tasks whose dueDate is today (calendar date, local TZ) */
  dueToday:   number
  /** sum of todo + inProgress + inReview + done (excludes cancelled — not in the bar) */
  total:      number
}

// ---------------------------------------------------------------------------
// My Tasks — workspace-wide tasks assigned to the authenticated user
// ---------------------------------------------------------------------------

export interface HomeTask {
  id:         string
  title:      string
  priority:   Task['priority']
  status:     Task['status']
  dueDate:    string | null
  projectId:  string
  projectName: string
  columnId:   string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface HomeState {
  /** Workspace-wide overview stats derived from all projects' tasks */
  overviewStats:    WorkspaceOverviewStats | null
  overviewLoading:  boolean
  overviewError:    string | null

  /** Tasks assigned to the authenticated user across all projects */
  myTasks:          HomeTask[]
  myTasksLoading:   boolean
  myTasksError:     string | null

  /** True after the first load has completed (used to show skeleton vs error vs data) */
  hasLoaded:        boolean

  // Actions
  fetchHomeData: (userId: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if dueDate falls on today's calendar date (local timezone).
 * dueDate is an ISO string from the DB (UTC).
 */
function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  const today = new Date()
  const due   = new Date(dueDate)
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth()    === today.getMonth()    &&
    due.getDate()     === today.getDate()
  )
}

/** Derive stats from a flat array of non-archived tasks. */
function deriveStats(tasks: Task[]): WorkspaceOverviewStats {
  let todo = 0, inProgress = 0, inReview = 0, done = 0, cancelled = 0
  let attention = 0, unassigned = 0, dueToday = 0

  for (const t of tasks) {
    switch (t.status) {
      case 'TODO':        todo++;        break
      case 'IN_PROGRESS': inProgress++;  break
      case 'IN_REVIEW':   inReview++;    break
      case 'DONE':        done++;        break
      case 'CANCELLED':   cancelled++;   break
    }
    if (t.priority === 'URGENT')   attention++
    if (!t.assigneeId)             unassigned++
    if (isDueToday(t.dueDate ?? null)) dueToday++
  }

  return {
    todo, inProgress, inReview, done, cancelled,
    attention, unassigned, dueToday,
    // Total excludes CANCELLED — those are not "active work"
    total: todo + inProgress + inReview + done,
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useHomeStore = create<HomeState>((set) => ({
  overviewStats:   null,
  overviewLoading: false,
  overviewError:   null,

  myTasks:         [],
  myTasksLoading:  false,
  myTasksError:    null,

  hasLoaded:       false,

  /**
   * fetchHomeData — loads all workspace tasks for the authenticated user.
   *
   * Strategy:
   *   1. Fetch all projects (re-uses existing projectsApi.list — workspace-scoped by JWT)
   *   2. For each project, fetch all tasks (GET /tasks?projectId=X)
   *   3. Aggregate stats from all tasks
   *   4. Filter to user's tasks (assigneeId === userId)
   *
   * The GET /tasks?assigneeId=Y filter only works per-project (projectId is required),
   * so we filter in-memory after fetching all tasks. This is correct and avoids
   * introducing new backend endpoints.
   */
  fetchHomeData: async (userId: string) => {
    set({ overviewLoading: true, myTasksLoading: true, overviewError: null, myTasksError: null })

    try {
      // Step 1 — get all workspace projects
      const projects: Project[] = await projectsApi.list()

      if (projects.length === 0) {
        // No projects → no tasks → honest zero state
        set({
          overviewStats: {
            todo: 0, inProgress: 0, inReview: 0, done: 0, cancelled: 0,
            attention: 0, unassigned: 0, dueToday: 0, total: 0,
          },
          overviewLoading: false,
          myTasks:         [],
          myTasksLoading:  false,
          hasLoaded:       true,
        })
        return
      }

      // Step 2 — fetch tasks for every project in parallel
      const taskBatches: Array<{ project: Project; tasks: Task[] }> = await Promise.all(
        projects.map(async (project) => {
          try {
            const tasks = await tasksApi.list({ projectId: project.id })
            return { project, tasks }
          } catch {
            // If a project's tasks fail to load, treat it as empty (partial failure)
            return { project, tasks: [] }
          }
        })
      )

      // Step 3 — flatten non-archived tasks for stats
      const allTasks = taskBatches
        .flatMap(({ tasks }) => tasks)
        .filter((t) => !t.isArchived)

      const stats = deriveStats(allTasks)

      // Step 4 — my tasks: assigned to userId, not archived, not cancelled
      const myTasks: HomeTask[] = taskBatches
        .flatMap(({ project, tasks }) =>
          tasks
            .filter((t) => !t.isArchived && t.assigneeId === userId && t.status !== 'CANCELLED')
            .map((t): HomeTask => ({
              id:          t.id,
              title:       t.title,
              priority:    t.priority,
              status:      t.status,
              dueDate:     t.dueDate ?? null,
              projectId:   t.projectId,
              projectName: project.name,
              columnId:    t.columnId,
            }))
        )
        // Sort: URGENT first, then HIGH, MEDIUM, LOW; then by due date ascending
        .sort((a, b) => {
          const pOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
          const pd = pOrder[a.priority] - pOrder[b.priority]
          if (pd !== 0) return pd
          // Secondary: due date ascending (tasks without due date go last)
          if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return 0
        })

      set({
        overviewStats:   stats,
        overviewLoading: false,
        myTasks,
        myTasksLoading:  false,
        hasLoaded:       true,
      })
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Failed to load workspace data'
      set({
        overviewError:   msg,
        overviewLoading: false,
        myTasksError:    msg,
        myTasksLoading:  false,
        hasLoaded:       true,
      })
    }
  },
}))
