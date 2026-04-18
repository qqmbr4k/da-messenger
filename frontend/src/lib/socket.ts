import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', { withCredentials: true, autoConnect: false })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
