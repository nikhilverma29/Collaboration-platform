/**
 * Central type definitions for the Syncra web app.
 *
 * These types are derived directly from:
 * - The JWT payload shape in apps/api/src/lib/jwt.ts
 * - The Prisma model fields returned by workspace.service.ts
 * - The WorkspaceRole enum in packages/validators/src/rbac.ts
 *
 * Do NOT import from @prisma/client or @syncra/validators in the web app —
 * keep types co-located here and in sync with the backend manually.
 */

// ---------------------------------------------------------------------------
// RBAC — mirrors packages/validators/src/rbac.ts WorkspaceRole enum exactly
// ---------------------------------------------------------------------------

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

// ---------------------------------------------------------------------------
// User — shape returned by POST /api/auth/login and POST /api/auth/register
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
}

// ---------------------------------------------------------------------------
// Workspace — shape returned by GET /api/workspaces (listUserWorkspaces)
// Each item: { role, joinedAt, workspace: { id, name, slug, ... } }
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  inviteCode: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMembership {
  role: WorkspaceRole
  joinedAt: string
  workspace: Workspace
}

// ---------------------------------------------------------------------------
// Active Tenant Context — what gets set after POST /api/workspaces/:id/switch
// Mirrors the JWT payload: { userId, workspaceId, role, sessionId }
// ---------------------------------------------------------------------------

export interface TenantContext {
  workspaceId: string
  role: WorkspaceRole
  workspace: Workspace  // hydrated from the workspace list after switch
}

// ---------------------------------------------------------------------------
// API response envelope — all Syncra API responses follow this shape
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string | object
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ---------------------------------------------------------------------------
// Project & Tasks — mirrors Prisma schema fields
// ---------------------------------------------------------------------------

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED'

export interface TaskAssignee {
  id: string
  displayName: string
  avatarUrl?: string | null
}

export interface Task {
  id: string
  workspaceId: string
  projectId: string
  columnId: string
  title: string
  description?: string | null
  priority: TaskPriority
  status: TaskStatus
  labels?: string | null
  assigneeId?: string | null
  assignee?: TaskAssignee | null
  reporterId: string
  reporter?: TaskAssignee | null
  dueDate?: string | null
  position: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Column {
  id: string
  boardId: string
  name: string
  position: number
  tasks?: Task[]
}

export interface Board {
  id: string
  projectId: string
  name: string
  columns: Column[]
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  isArchived: boolean
  createdById: string
  createdAt: string
  updatedAt: string
  boards?: Board[]
}

export interface CreateTaskInput {
  projectId: string
  columnId: string
  title: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  labels?: string
  assigneeId?: string | null
  dueDate?: string | null
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  labels?: string
  assigneeId?: string | null
  dueDate?: string | null
  isArchived?: boolean
}

// ---------------------------------------------------------------------------
// Tag Color & Labels System
// ---------------------------------------------------------------------------

export interface TagColorStyle {
  bg: string
  text: string
  border: string
}

export function getTagColor(tagName: string): TagColorStyle {
  const norm = tagName.trim().toLowerCase()

  // 1. Bug / Defect / Fix (Red / Rose)
  if (/bug|defect|fix|issue|error|fail|broken/.test(norm)) {
    return {
      bg: 'rgba(239, 68, 68, 0.12)',
      text: '#f87171',
      border: 'rgba(239, 68, 68, 0.25)',
    }
  }

  // 2. Feature / Frontend / Client (Indigo / Cyan)
  if (/feature|frontend|client|ui|web|app|react/.test(norm)) {
    return {
      bg: 'rgba(99, 102, 241, 0.12)',
      text: '#818cf8',
      border: 'rgba(99, 102, 241, 0.25)',
    }
  }

  // 3. Backend / API / Database (Emerald / Teal)
  if (/backend|api|database|db|server|endpoint|sql|node|infra/.test(norm)) {
    return {
      bg: 'rgba(16, 185, 129, 0.12)',
      text: '#34d399',
      border: 'rgba(16, 185, 129, 0.25)',
    }
  }

  // 4. Design / UI/UX (Purple / Violet)
  if (/design|ui\/ux|ux|figma|brand|style|theme|asset/.test(norm)) {
    return {
      bg: 'rgba(168, 85, 247, 0.12)',
      text: '#c084fc',
      border: 'rgba(168, 85, 247, 0.25)',
    }
  }

  // 5. P0 / Urgent / Security (Amber / Orange)
  if (/p0|urgent|security|sec|crit|alert|blocker/.test(norm)) {
    return {
      bg: 'rgba(245, 158, 11, 0.14)',
      text: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.3)',
    }
  }

  // 6. Documentation
  if (/doc|readme|wiki|guide/.test(norm)) {
    return {
      bg: 'rgba(14, 165, 233, 0.12)',
      text: '#38bdf8',
      border: 'rgba(14, 165, 233, 0.25)',
    }
  }

  // 7. Refactor
  if (/refactor|perf|test|qa/.test(norm)) {
    return {
      bg: 'rgba(236, 72, 153, 0.12)',
      text: '#f472b6',
      border: 'rgba(236, 72, 153, 0.25)',
    }
  }

  // Default / Custom: Neutral Zinc / Slate tint
  return {
    bg: 'rgba(148, 163, 184, 0.1)',
    text: '#cbd5e1',
    border: 'rgba(148, 163, 184, 0.2)',
  }
}

export function parseTags(labels: string | null | undefined): string[] {
  if (!labels) return []
  try {
    const parsed = JSON.parse(labels)
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === 'string')
  } catch {}
  // Fallback: treat as comma-separated plain string
  return labels.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getTaskTags(task: { title: string; labels?: string | null }): string[] {
  const parsed = parseTags(task.labels)
  if (parsed.length > 0) return parsed

  // Fallback inferred tags from task title for seed tasks
  const t = task.title.toLowerCase()
  const tags: string[] = []

  if (/bug|error|broken|fail|crash|fix/.test(t)) {
    tags.push('Bug')
  }
  if (/ui|design|layout|css|theme|drawer|modal|view/.test(t)) {
    tags.push('Design')
  }
  if (/api|endpoint|backend|db|database|auth|server/.test(t)) {
    tags.push('Backend')
  }
  if (/front|client|component|page|button|input|toolbar|board|list/.test(t)) {
    tags.push('Frontend')
  }
  if (/doc|readme|guide|spec/.test(t)) {
    tags.push('Documentation')
  }
  if (/p0|urgent|critical|security/.test(t)) {
    tags.push('P0')
  }

  return tags.length > 0 ? tags : ['Frontend']
}

