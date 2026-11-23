import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000'

let socket: Socket | null = null

/**
 * Creates and returns the Socket.io client singleton.
 * Uses the same HTTP-only cookie for auth as the REST API.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true, // sends syncra_access cookie
      autoConnect: false,    // we connect manually after login
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect()
    socket = null
  }
}
