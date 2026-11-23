import api from './api'
import type { Project, Task, Board, Column, CreateTaskInput, UpdateTaskInput } from '@/types'

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------

export const projectsApi = {
  list: async (): Promise<Project[]> => {
    const res = await api.get('/projects')
    return res.data.data
  },

  getOne: async (projectId: string): Promise<Project & { boards: Board[] }> => {
    const res = await api.get(`/projects/${projectId}`)
    return res.data.data
  },

  create: async (data: { name: string; description?: string }): Promise<Project> => {
    const res = await api.post('/projects', data)
    return res.data.data
  },
}

// ---------------------------------------------------------------------------
// Boards / Columns API
// ---------------------------------------------------------------------------

export const boardsApi = {
  listColumns: async (boardId: string): Promise<Column[]> => {
    const res = await api.get(`/projects/boards/${boardId}/columns`)
    return res.data.data
  },

  createColumn: async (boardId: string, data: { name: string; position: number }): Promise<Column> => {
    const res = await api.post(`/projects/boards/${boardId}/columns`, data)
    return res.data.data
  },
}

// ---------------------------------------------------------------------------
// Tasks API
// ---------------------------------------------------------------------------

export const tasksApi = {
  list: async (params: { projectId: string; assigneeId?: string; priority?: string; status?: string }): Promise<Task[]> => {
    const res = await api.get('/tasks', { params })
    return res.data.data
  },

  getOne: async (taskId: string): Promise<Task> => {
    const res = await api.get(`/tasks/${taskId}`)
    return res.data.data
  },

  create: async (data: CreateTaskInput): Promise<Task> => {
    const res = await api.post('/tasks', data)
    return res.data.data
  },

  update: async (taskId: string, data: UpdateTaskInput): Promise<Task> => {
    const res = await api.put(`/tasks/${taskId}`, data)
    return res.data.data
  },

  move: async (taskId: string, data: { columnId?: string; position: number }): Promise<Task> => {
    const res = await api.post(`/tasks/${taskId}/move`, data)
    return res.data.data
  },

  delete: async (taskId: string): Promise<void> => {
    await api.delete(`/tasks/${taskId}`)
  },
}

// ---------------------------------------------------------------------------
// Subtasks API
// ---------------------------------------------------------------------------

export const subtasksApi = {
  list: async (taskId: string): Promise<any[]> => {
    const res = await api.get(`/tasks/${taskId}/subtasks`)
    return res.data.data
  },

  create: async (taskId: string, title: string): Promise<any> => {
    const res = await api.post(`/tasks/${taskId}/subtasks`, { title })
    return res.data.data
  },

  toggle: async (subtaskId: string, done: boolean): Promise<any> => {
    const res = await api.patch(`/tasks/subtasks/${subtaskId}`, { done })
    return res.data.data
  },

  delete: async (subtaskId: string): Promise<void> => {
    await api.delete(`/tasks/subtasks/${subtaskId}`)
  },
}

// ---------------------------------------------------------------------------
// Comments API
// ---------------------------------------------------------------------------

export const commentsApi = {
  list: async (taskId: string): Promise<any[]> => {
    const res = await api.get(`/tasks/${taskId}/comments`)
    return res.data.data
  },

  create: async (taskId: string, content: string, isSystem?: boolean): Promise<any> => {
    const res = await api.post(`/tasks/${taskId}/comments`, { content, isSystem })
    return res.data.data
  },
}
