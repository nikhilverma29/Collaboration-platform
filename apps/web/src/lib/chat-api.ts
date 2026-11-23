import api from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelMember {
  user: { id: string; displayName: string; avatarUrl?: string | null }
}

export interface Channel {
  id: string
  workspaceId: string
  name: string | null
  description?: string | null
  type: 'PUBLIC' | 'PRIVATE' | 'DIRECT'
  isArchived: boolean
  createdById: string
  createdAt: string
  updatedAt: string
  members: ChannelMember[]
  _count?: { messages: number }
}

export interface MessageReaction {
  id: string
  emoji: string
  user: { id: string; displayName: string }
}

export interface ChatMessage {
  id: string
  workspaceId: string
  channelId: string
  authorId: string
  author: { id: string; displayName: string; avatarUrl?: string | null }
  content: string
  parentId?: string | null
  isEdited: boolean
  isDeleted: boolean
  fileId?: string | null
  reactions: MessageReaction[]
  _count?: { replies: number }
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Channels API
// ---------------------------------------------------------------------------

export const channelsApi = {
  list: async (): Promise<Channel[]> => {
    const res = await api.get('/channels')
    return res.data.data
  },

  create: async (data: { name: string; description?: string; type: 'PUBLIC' | 'PRIVATE' }): Promise<Channel> => {
    const res = await api.post('/channels', data)
    return res.data.data
  },

  markRead: async (channelId: string, messageId: string): Promise<void> => {
    await api.post(`/channels/${channelId}/read`, { messageId })
  },

  getUnreadCount: async (channelId: string): Promise<number> => {
    const res = await api.get(`/channels/${channelId}/unread-count`)
    return res.data.data?.unreadCount ?? 0
  },

  createDM: async (targetUserId: string): Promise<Channel> => {
    const res = await api.post('/channels/dm', { targetUserId })
    return res.data.data
  },
}

// ---------------------------------------------------------------------------
// Messages API
// ---------------------------------------------------------------------------

export const messagesApi = {
  list: async (channelId: string, limit = 50, before?: string): Promise<ChatMessage[]> => {
    const params: Record<string, any> = { channelId, limit }
    if (before) params.before = before
    const res = await api.get('/messages', { params })
    return res.data.data
  },

  send: async (data: { channelId: string; content: string; parentId?: string }): Promise<ChatMessage> => {
    const res = await api.post('/messages', data)
    return res.data.data
  },

  edit: async (messageId: string, content: string): Promise<ChatMessage> => {
    const res = await api.put(`/messages/${messageId}`, { content })
    return res.data.data
  },

  delete: async (messageId: string): Promise<void> => {
    await api.delete(`/messages/${messageId}`)
  },

  toggleReaction: async (messageId: string, emoji: string): Promise<{ action: string; emoji: string }> => {
    const res = await api.post(`/messages/${messageId}/reactions`, { emoji })
    return res.data.data
  },

  typingStart: async (channelId: string): Promise<void> => {
    await api.post('/messages/typing/start', { channelId }).catch(() => {})
  },

  typingStop: async (channelId: string): Promise<void> => {
    await api.post('/messages/typing/stop', { channelId }).catch(() => {})
  },
}
