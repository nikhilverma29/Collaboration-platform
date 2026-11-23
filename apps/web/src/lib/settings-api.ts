import api from './api'
import type { AuthUser, WorkspaceMembership } from '@/types'

// ---------------------------------------------------------------------------
// User / Profile API
// ---------------------------------------------------------------------------

export const userApi = {
  getProfile: async (): Promise<AuthUser> => {
    const res = await api.get('/users/me')
    return res.data.data
  },

  updateProfile: async (data: { displayName?: string }): Promise<AuthUser> => {
    const res = await api.put('/users/me', data)
    return res.data.data
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    await api.put('/users/me/password', data)
  },
}

// ---------------------------------------------------------------------------
// Workspace Settings API
// ---------------------------------------------------------------------------

export interface WorkspaceMember {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
  role: string
  joinedAt: string
}

export const workspaceSettingsApi = {
  update: async (workspaceId: string, data: { name: string }): Promise<void> => {
    await api.put(`/workspaces/${workspaceId}`, data)
  },

  getMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const res = await api.get(`/workspaces/${workspaceId}/members`)
    return res.data.data
  },

  removeMember: async (workspaceId: string, userId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}/members/${userId}`)
  },

  // Join uses invite code — show the code to invite others
  getWorkspace: async (workspaceId: string): Promise<any> => {
    // Get from list since there's no single GET
    const res = await api.get('/workspaces')
    const memberships: WorkspaceMembership[] = res.data.data
    const match = memberships.find(m => m.workspace.id === workspaceId)
    return match?.workspace ?? null
  },
}
