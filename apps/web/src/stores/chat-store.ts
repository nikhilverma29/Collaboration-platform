import { create } from 'zustand'
import { channelsApi, messagesApi } from '@/lib/chat-api'
import type { Channel, ChatMessage } from '@/lib/chat-api'
import { getSocket, connectSocket } from '@/lib/socket'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ChatState {
  channels:          Channel[]
  channelsLoading:   boolean
  channelsError:     string | null

  activeChannelId:   string | null
  messagesByChannel: Record<string, ChatMessage[]>
  messagesLoading:   boolean

  typingUsers:        Record<string, string[]>
  unreadCounts:       Record<string, number>
  showCreateChannel:  boolean
  isRealtimeConnected: boolean

  // Actions
  fetchChannels:         () => Promise<void>
  setActiveChannel:      (channelId: string) => Promise<void>
  fetchMessages:         (channelId: string, before?: string) => Promise<void>
  sendMessage:           (channelId: string, content: string) => Promise<void>
  editMessage:           (messageId: string, channelId: string, content: string) => Promise<void>
  deleteMessage:         (messageId: string, channelId: string) => Promise<void>
  toggleReaction:        (messageId: string, channelId: string, emoji: string) => Promise<void>
  createChannel:         (data: { name: string; description?: string; type: 'PUBLIC'|'PRIVATE' }) => Promise<Channel>
  createDM:              (targetUserId: string) => Promise<Channel>
  addIncomingMessage:    (msg: ChatMessage) => void
  setTyping:             (channelId: string, displayName: string, isTyping: boolean) => void
  connectRealtime:       () => void
  setShowCreateChannel:  (v: boolean) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatState>((set, get) => ({
  channels:           [],
  channelsLoading:    false,
  channelsError:      null,
  activeChannelId:    null,
  messagesByChannel:  {},
  messagesLoading:    false,
  typingUsers:        {},
  unreadCounts:       {},
  showCreateChannel:  false,
  isRealtimeConnected: false,

  // ── UI state ─────────────────────────────────────────────────────────────

  setShowCreateChannel: (v) => set({ showCreateChannel: v }),

  // ── Channels ─────────────────────────────────────────────────────────────

  fetchChannels: async () => {
    // Prevent duplicate concurrent requests or rapid spam
    if (get().channelsLoading) return
    set({ channelsLoading: true, channelsError: null })
    try {
      const channels = await channelsApi.list()
      set({ channels, channelsLoading: false, channelsError: null })
    } catch (e: any) {
      // Preserve existing channels — only update the error message.
      // This prevents the sidebar from flashing "No channels yet" on a transient error.
      set(s => ({
        channelsLoading: false,
        channelsError: e?.response?.data?.error ?? 'Failed to load channels',
        // Keep any channels that were previously loaded
        channels: s.channels.length > 0 ? s.channels : s.channels,
      }))
    }
  },

  setActiveChannel: async (channelId) => {
    const state = get()
    if (state.activeChannelId === channelId && state.messagesByChannel[channelId]) {
      return
    }
    set({ activeChannelId: channelId })
    // Mark as read — pass the id of the last message we have loaded for this channel.
    // If no messages are loaded yet we skip the call (backend requires a valid messageId).
    const msgs = state.messagesByChannel[channelId]
    const lastMsg = msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null
    if (lastMsg) {
      channelsApi.markRead(channelId, lastMsg.id).catch(() => {})
    }
    set(s => {
      if ((s.unreadCounts[channelId] ?? 0) === 0) return s
      return { unreadCounts: { ...s.unreadCounts, [channelId]: 0 } }
    })
    // Load messages if not already loaded
    if (!get().messagesByChannel[channelId]) {
      await get().fetchMessages(channelId)
    }
  },

  fetchMessages: async (channelId, before) => {
    set({ messagesLoading: true })
    try {
      const msgs = await messagesApi.list(channelId, 50, before)
      set(s => ({
        messagesLoading: false,
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: before
            ? [...msgs, ...(s.messagesByChannel[channelId] ?? [])]  // prepend older msgs
            : msgs,
        }
      }))
    } catch {
      set({ messagesLoading: false })
    }
  },

  // ── Messages ──────────────────────────────────────────────────────────────

  sendMessage: async (channelId, content) => {
    const msg = await messagesApi.send({ channelId, content })
    // Optimistically add — real-time will also fire but we deduplicate by id
    get().addIncomingMessage(msg)
  },

  editMessage: async (messageId, channelId, content) => {
    const updated = await messagesApi.edit(messageId, content)
    set(s => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).map(m => m.id === messageId ? updated : m),
      }
    }))
  },

  deleteMessage: async (messageId, channelId) => {
    await messagesApi.delete(messageId)
    // Show tombstone immediately (backend soft-deletes)
    set(s => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).map(m =>
          m.id === messageId ? { ...m, isDeleted: true, content: '[This message was deleted]' } : m
        ),
      }
    }))
  },

  toggleReaction: async (messageId, channelId, emoji) => {
    // Fire-and-forget; real-time update will handle UI refresh
    await messagesApi.toggleReaction(messageId, emoji)
    // For now refresh the whole message list after toggle
    await get().fetchMessages(channelId)
  },

  createChannel: async (data) => {
    const channel = await channelsApi.create(data)
    set(s => {
      if (s.channels.some(c => c.id === channel.id)) return s
      return { channels: [channel, ...s.channels] }
    })
    await get().setActiveChannel(channel.id)
    return channel
  },

  createDM: async (targetUserId: string) => {
    const dm = await channelsApi.createDM(targetUserId)
    set(s => {
      if (s.channels.some(c => c.id === dm.id)) return s
      return { channels: [dm, ...s.channels] }
    })
    await get().setActiveChannel(dm.id)
    return dm
  },

  addIncomingMessage: (msg) => {
    set(s => {
      const existing = s.messagesByChannel[msg.channelId] ?? []
      // Deduplicate by id
      if (existing.some(m => m.id === msg.id)) return s
      const updated = [...existing, msg]
      // Bump unread if not active channel
      const unread = msg.channelId !== s.activeChannelId
        ? { ...s.unreadCounts, [msg.channelId]: (s.unreadCounts[msg.channelId] ?? 0) + 1 }
        : s.unreadCounts
      return {
        messagesByChannel: { ...s.messagesByChannel, [msg.channelId]: updated },
        unreadCounts: unread,
      }
    })
  },

  setTyping: (channelId, displayName, isTyping) => {
    set(s => {
      const curr = s.typingUsers[channelId] ?? []
      const next = isTyping
        ? curr.includes(displayName) ? curr : [...curr, displayName]
        : curr.filter(n => n !== displayName)
      return { typingUsers: { ...s.typingUsers, [channelId]: next } }
    })
  },

  // ── Real-time ─────────────────────────────────────────────────────────────

  connectRealtime: () => {
    if (get().isRealtimeConnected) return
    set({ isRealtimeConnected: true })

    const socket = getSocket()
    connectSocket()

    // Clean up any stale listeners before attaching
    socket.off('message:sent')
    socket.off('message:updated')
    socket.off('message:deleted')
    socket.off('typing:start')
    socket.off('typing:stop')
    socket.off('channel:created')

    socket.on('message:sent', (payload: { data: ChatMessage }) => {
      get().addIncomingMessage(payload.data)
    })

    socket.on('message:updated', (payload: { data: ChatMessage }) => {
      const msg = payload.data
      set(s => ({
        messagesByChannel: {
          ...s.messagesByChannel,
          [msg.channelId]: (s.messagesByChannel[msg.channelId] ?? []).map(m => m.id === msg.id ? msg : m),
        }
      }))
    })

    socket.on('message:deleted', (payload: { data: { id: string; channelId: string } }) => {
      const { id, channelId } = payload.data
      set(s => ({
        messagesByChannel: {
          ...s.messagesByChannel,
          [channelId]: (s.messagesByChannel[channelId] ?? []).map(m =>
            m.id === id ? { ...m, isDeleted: true, content: '[This message was deleted]' } : m
          ),
        }
      }))
    })

    // Backend sends: { actorId: userId, data: { channelId, userId } }
    // It does NOT send displayName — we resolve it from the already-loaded
    // channel members list. Falls back to userId string if not found.
    // Full defensive guards: payload, payload.data, channelId, userId, and
    // member array items may all be undefined depending on socket shape/timing.
    socket.on('typing:start', (payload: any) => {
      try {
        const data = payload?.data ?? payload
        const channelId: string | undefined = data?.channelId
        const userId: string | undefined = data?.userId ?? payload?.actorId
        if (!channelId || !userId) return
        const channel = get().channels.find(c => c?.id === channelId)
        const member = channel?.members?.find(m => m?.user?.id === userId)
        const displayName = member?.user?.displayName ?? userId
        get().setTyping(channelId, displayName, true)
      } catch {/* never crash the store from a socket event */}
    })

    socket.on('typing:stop', (payload: any) => {
      try {
        const data = payload?.data ?? payload
        const channelId: string | undefined = data?.channelId
        const userId: string | undefined = data?.userId ?? payload?.actorId
        if (!channelId || !userId) return
        const channel = get().channels.find(c => c?.id === channelId)
        const member = channel?.members?.find(m => m?.user?.id === userId)
        const displayName = member?.user?.displayName ?? userId
        get().setTyping(channelId, displayName, false)
      } catch {/* never crash the store from a socket event */}
    })

    socket.on('channel:created', (payload: { data: Channel }) => {
      set(s => {
        if (s.channels.some(c => c.id === payload.data.id)) return s
        return { channels: [...s.channels, payload.data] }
      })
    })
  },
}))

