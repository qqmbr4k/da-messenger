import { Server, Socket } from 'socket.io'
import { verifyToken } from '../lib/jwt'
import prisma from '../lib/prisma'

type PresenceStatus = 'online' | 'afk' | 'offline'

interface TabState {
  socketId: string
  userId: string
  lastActivity: number
  status: PresenceStatus
}

// userId -> set of TabState
const userTabs = new Map<string, Map<string, TabState>>()
const AFK_MS = 60_000

function computeUserStatus(tabs: Map<string, TabState>): PresenceStatus {
  if (tabs.size === 0) return 'offline'
  const now = Date.now()
  for (const tab of tabs.values()) {
    if (now - tab.lastActivity < AFK_MS) return 'online'
  }
  return 'afk'
}

async function broadcastPresence(io: Server, userId: string, status: PresenceStatus) {
  // Broadcast to all rooms this user is in
  const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } })
  for (const { roomId } of memberships) {
    io.to(`room:${roomId}`).emit('presence', { userId, status })
  }
}

export function setupPresence(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.match(/token=([^;]+)/)?.[1]
    if (!token) return next(new Error('Unauthorized'))
    try {
      const payload = verifyToken(token)
      const session = await prisma.session.findUnique({ where: { id: payload.sessionId } })
      if (!session || session.expiresAt < new Date()) return next(new Error('Session expired'))
      ;(socket as any).userId = payload.userId
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId as string

    // Register tab
    if (!userTabs.has(userId)) userTabs.set(userId, new Map())
    const tabs = userTabs.get(userId)!
    tabs.set(socket.id, { socketId: socket.id, userId, lastActivity: Date.now(), status: 'online' })

    // Join room channels
    const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } })
    for (const { roomId } of memberships) {
      socket.join(`room:${roomId}`)
    }
    socket.join(`user:${userId}`)

    broadcastPresence(io, userId, 'online')

    // Heartbeat from client (sent on user activity)
    socket.on('heartbeat', () => {
      const tab = tabs.get(socket.id)
      if (tab) {
        const wasAfk = computeUserStatus(tabs) !== 'online'
        tab.lastActivity = Date.now()
        if (wasAfk) broadcastPresence(io, userId, 'online')
      }
    })

    // Periodic AFK check — compare against last-broadcast status so transitions fire
    let lastBroadcastStatus: PresenceStatus = 'online'
    const afkTimer = setInterval(async () => {
      const nowStatus = computeUserStatus(tabs)
      if (nowStatus !== lastBroadcastStatus) {
        lastBroadcastStatus = nowStatus
        await broadcastPresence(io, userId, nowStatus)
      }
    }, 15_000)

    // Join a room channel and reply with current seq so client can detect gaps
    socket.on('join_room', async (roomId: string) => {
      socket.join(`room:${roomId}`)
      const row = await prisma.roomSeq.findUnique({ where: { roomId } })
      socket.emit('room_seq', { roomId, seq: row ? Number(row.seq) : 0 })
    })

    socket.on('leave_room', (roomId: string) => {
      socket.leave(`room:${roomId}`)
    })

    // Typing indicator
    socket.on('typing', async (data: { roomId: string }) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
      socket.to(`room:${data.roomId}`).emit('typing', { userId, username: user?.username, roomId: data.roomId })
    })

    socket.on('disconnect', async () => {
      clearInterval(afkTimer)
      tabs.delete(socket.id)
      const status = computeUserStatus(tabs)
      await broadcastPresence(io, userId, status)
      if (tabs.size === 0) userTabs.delete(userId)
    })
  })
}

export function getUserStatus(userId: string): PresenceStatus {
  const tabs = userTabs.get(userId)
  if (!tabs || tabs.size === 0) return 'offline'
  return computeUserStatus(tabs)
}
