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

function onAsync(socket: Socket, event: string, handler: (...args: any[]) => Promise<void>) {
  socket.on(event, (...args: any[]) => {
    handler(...args).catch(err => console.error(`[presence] ${event} error:`, err))
  })
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

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string

    // Register tab
    if (!userTabs.has(userId)) userTabs.set(userId, new Map())
    const tabs = userTabs.get(userId)!
    tabs.set(socket.id, { socketId: socket.id, userId, lastActivity: Date.now(), status: 'online' })

    // Join room channels then broadcast online status
    prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } })
      .then(memberships => {
        for (const { roomId } of memberships) socket.join(`room:${roomId}`)
        socket.join(`user:${userId}`)
        return broadcastPresence(io, userId, 'online')
      })
      .catch(err => console.error('[presence] connection setup error:', err))

    // Heartbeat from client (sent on user activity)
    socket.on('heartbeat', () => {
      const tab = tabs.get(socket.id)
      if (tab) {
        const wasAfk = computeUserStatus(tabs) !== 'online'
        tab.lastActivity = Date.now()
        if (wasAfk) broadcastPresence(io, userId, 'online').catch(err => console.error('[presence] heartbeat broadcast error:', err))
      }
    })

    // Periodic AFK check — compare against last-broadcast status so transitions fire
    let lastBroadcastStatus: PresenceStatus = 'online'
    const afkTimer = setInterval(() => {
      const nowStatus = computeUserStatus(tabs)
      if (nowStatus !== lastBroadcastStatus) {
        lastBroadcastStatus = nowStatus
        broadcastPresence(io, userId, nowStatus).catch(err => console.error('[presence] afk broadcast error:', err))
      }
    }, 15_000)

    // Join a room channel and reply with current seq so client can detect gaps
    onAsync(socket, 'join_room', async (roomId: string) => {
      socket.join(`room:${roomId}`)
      const row = await prisma.roomSeq.findUnique({ where: { roomId } })
      socket.emit('room_seq', { roomId, seq: row ? Number(row.seq) : 0 })
      // Send current presence state of all room members to this socket
      const members = await prisma.roomMember.findMany({ where: { roomId }, select: { userId: true } })
      console.log(`[presence] join_room ${roomId}, members: ${members.length}, userTabsSize: ${userTabs.size}`)
      for (const { userId: memberId } of members) {
        const tabs = userTabs.get(memberId)
        const status = tabs && tabs.size > 0 ? computeUserStatus(tabs) : 'offline'
        console.log(`[presence] emit to socket: userId=${memberId}, status=${status}, hasTabs=${!!tabs}`)
        socket.emit('presence', { userId: memberId, status })
      }
    })

    socket.on('leave_room', (roomId: string) => {
      socket.leave(`room:${roomId}`)
    })

    // Typing indicator
    onAsync(socket, 'typing', async (data: { roomId: string }) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
      socket.to(`room:${data.roomId}`).emit('typing', { userId, username: user?.username, roomId: data.roomId })
    })

    // ── WebRTC signaling relay ──────────────────────────────────────────────
    // All events are relayed only to the specific target user. The server
    // never inspects or stores SDP/ICE content.

    // Cache of peer userId → boolean (has shared DM) to avoid per-candidate DB queries
    const dmPeerCache = new Map<string, boolean>()

    async function hasDm(peerId: string): Promise<boolean> {
      if (dmPeerCache.has(peerId)) return dmPeerCache.get(peerId)!
      const sharedDm = await prisma.room.findFirst({
        where: {
          type: 'DIRECT',
          members: { some: { userId } },
          AND: [{ members: { some: { userId: peerId } } }],
        },
        select: { id: true },
      })
      const result = !!sharedDm
      dmPeerCache.set(peerId, result)
      return result
    }

    onAsync(socket, 'call_offer', async (data: { to: string; signal: unknown; isVideo: boolean }) => {
      if (typeof data?.to !== 'string') { console.log(`[call] call_offer from ${userId}: invalid 'to'`); return }
      console.log(`[call] call_offer from=${userId} to=${data.to} isVideo=${data.isVideo}`)
      if (!(await hasDm(data.to))) { console.log(`[call] call_offer BLOCKED — no shared DM between ${userId} and ${data.to}`); return }
      const caller = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
      const sockets = await io.in(`user:${data.to}`).allSockets()
      console.log(`[call] relaying call_offer to user:${data.to} (${sockets.size} sockets)`)
      io.to(`user:${data.to}`).emit('call_offer', {
        from: userId, signal: data.signal, isVideo: !!data.isVideo,
        fromUsername: caller?.username ?? userId,
      })
    })

    onAsync(socket, 'call_answer', async (data: { to: string; signal: unknown }) => {
      if (typeof data?.to !== 'string') { console.log(`[call] call_answer from ${userId}: invalid 'to'`); return }
      if (!(await hasDm(data.to))) { console.log(`[call] call_answer BLOCKED — no shared DM between ${userId} and ${data.to}`); return }
      console.log(`[call] call_answer from=${userId} to=${data.to}`)
      io.to(`user:${data.to}`).emit('call_answer', { from: userId, signal: data.signal })
    })

    let iceCount = 0
    onAsync(socket, 'call_ice', async (data: { to: string; candidate: unknown }) => {
      if (typeof data?.to !== 'string') return
      if (!(await hasDm(data.to))) { console.log(`[call] call_ice BLOCKED — no shared DM between ${userId} and ${data.to}`); return }
      iceCount++
      if (iceCount === 1) console.log(`[call] call_ice relaying from=${userId} to=${data.to} (first candidate)`)
      io.to(`user:${data.to}`).emit('call_ice', { from: userId, candidate: data.candidate })
    })

    socket.on('call_end', (data: { to: string }) => {
      if (typeof data?.to !== 'string') return
      console.log(`[call] call_end from=${userId} to=${data.to}`)
      io.to(`user:${data.to}`).emit('call_end', { from: userId })
    })

    socket.on('call_reject', (data: { to: string }) => {
      if (typeof data?.to !== 'string') return
      console.log(`[call] call_reject from=${userId} to=${data.to}`)
      io.to(`user:${data.to}`).emit('call_reject', { from: userId })
    })

    socket.on('call_busy', (data: { to: string }) => {
      if (typeof data?.to !== 'string') return
      console.log(`[call] call_busy from=${userId} to=${data.to}`)
      io.to(`user:${data.to}`).emit('call_busy', { from: userId })
    })

    onAsync(socket, 'disconnect', async () => {
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

// Server-side: add all of a user's active sockets to a Socket.IO room
export function joinUserToRoom(io: Server, userId: string, socketRoom: string) {
  const tabs = userTabs.get(userId)
  if (!tabs) return
  for (const tab of tabs.values()) {
    io.in(tab.socketId).socketsJoin(socketRoom)
  }
}

// Server-side: remove all of a user's active sockets from a Socket.IO room
export function leaveUserFromRoom(io: Server, userId: string, socketRoom: string) {
  const tabs = userTabs.get(userId)
  if (!tabs) return
  for (const tab of tabs.values()) {
    io.in(tab.socketId).socketsLeave(socketRoom)
  }
}
