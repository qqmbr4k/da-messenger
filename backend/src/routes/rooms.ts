import { asyncHandler } from '../lib/asyncHandler'
import { Router, Response, Request } from 'express'
import { Server } from 'socket.io'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getUserStatus, joinUserToRoom, leaveUserFromRoom } from '../services/presence'

interface IoRequest extends Request { io?: Server }

const router = Router()

// Public room catalog
router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search } = req.query
  const rooms = await prisma.room.findMany({
    where: {
      type: 'PUBLIC',
      ...(search ? { name: { contains: String(search), mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      ownerId: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  })
  res.json(rooms)
}))

// My rooms (all types where I'm a member)
router.get('/my', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.roomMember.findMany({
    where: { userId: req.userId },
    include: {
      room: {
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          ownerId: true,
          _count: { select: { members: true } },
        },
      },
    },
  })
  res.json(memberships.map(m => m.room))
}))

// Create room
router.post('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description, type } = req.body
  if (!name) {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const roomType = type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
  try {
    const room = await prisma.$transaction(async tx => {
      const r = await tx.room.create({
        data: { name, description: description || '', type: roomType, ownerId: req.userId },
      })
      await tx.roomMember.create({ data: { userId: req.userId!, roomId: r.id } })
      await tx.roomAdmin.create({ data: { userId: req.userId!, roomId: r.id } })
      return r
    })
    res.status(201).json(room)
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ error: 'Room name already taken' })
      return
    }
    throw e
  }
}))

// Get single room
// Get my pending invitations — must be defined before /:id to avoid param capture
router.get('/invitations/pending', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const invs = await prisma.roomInvitation.findMany({
    where: { userId: req.userId },
    include: {
      room: { select: { id: true, name: true, description: true } },
      invitedBy: { select: { id: true, username: true } },
    },
  })
  res.json(invs)
}))

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, username: true } },
      admins: { include: { user: { select: { id: true, username: true } } } },
      members: { include: { user: { select: { id: true, username: true } } } },
    },
  })
  if (!room) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  const isMember = room.members.some(m => m.userId === req.userId)
  if (!isMember && room.type !== 'PUBLIC') {
    res.status(403).json({ error: 'Access denied' })
    return
  }
  res.json(room)
}))

// Bulk presence for all room members
router.get('/:id/presence', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const isMember = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isMember) {
    res.status(403).json({ error: 'Access denied' })
    return
  }
  const members = await prisma.roomMember.findMany({
    where: { roomId: req.params.id },
    select: { userId: true },
  })
  res.json(members.map(m => ({ userId: m.userId, status: getUserStatus(m.userId) })))
}))

// Join public room
router.post('/:id/join', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  if (room.type !== 'PUBLIC') {
    res.status(403).json({ error: 'Room is not public' })
    return
  }
  const ban = await prisma.roomBan.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: room.id } },
  })
  if (ban) {
    res.status(403).json({ error: 'You are banned from this room' })
    return
  }
  const existing = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: room.id } },
  })
  if (!existing) {
    await prisma.roomMember.create({ data: { userId: req.userId!, roomId: room.id } })
    const io = (req as IoRequest).io
    if (io) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
      joinUserToRoom(io, req.userId!, `room:${room.id}`)
      io.to(`room:${room.id}`).emit('member_joined', { roomId: room.id, userId: req.userId, username: user?.username })
      io.to(`user:${req.userId!}`).emit('joined_room', { roomId: room.id, room: { id: room.id, name: room.name, description: room.description, type: room.type, ownerId: room.ownerId } })
    }
  }
  res.json({ ok: true })
}))

// Leave room
router.post('/:id/leave', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  if (room.ownerId === req.userId) {
    res.status(403).json({ error: 'Owner cannot leave. Delete the room instead.' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
  await prisma.roomMember.deleteMany({ where: { userId: req.userId, roomId: req.params.id } })
  const io = (req as IoRequest).io
  if (io) {
    leaveUserFromRoom(io, req.userId!, `room:${req.params.id}`)
    io.to(`room:${req.params.id}`).emit('member_left', { roomId: req.params.id, userId: req.userId, username: user?.username })
    io.to(`user:${req.userId!}`).emit('removed_from_room', { roomId: req.params.id })
  }
  res.json({ ok: true })
}))

// Update room settings (owner only)
router.put('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room || room.ownerId !== req.userId) {
    res.status(403).json({ error: 'Only the owner can update this room' })
    return
  }
  const { name, description, type } = req.body
  const updated = await prisma.room.update({
    where: { id: req.params.id },
    data: {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(type === 'PUBLIC' || type === 'PRIVATE' ? { type } : {}),
    },
  })
  ;(req as IoRequest).io?.to(`room:${req.params.id}`).emit('room_updated', {
    roomId: req.params.id, name: updated.name, description: updated.description, type: updated.type,
  })
  res.json(updated)
}))

// Delete room (owner only)
router.delete('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room || room.ownerId !== req.userId) {
    res.status(403).json({ error: 'Only the owner can delete this room' })
    return
  }
  const members = await prisma.roomMember.findMany({ where: { roomId: req.params.id }, select: { userId: true } })
  await prisma.room.delete({ where: { id: req.params.id } })
  const io = (req as IoRequest).io
  if (io) {
    for (const m of members) {
      io.to(`user:${m.userId}`).emit('removed_from_room', { roomId: req.params.id })
    }
  }
  res.json({ ok: true })
}))

// --- Admin actions ---

// Get banned users
router.get('/:id/bans', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isAdmin) {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  const bans = await prisma.roomBan.findMany({
    where: { roomId: req.params.id },
    include: {
      user: { select: { id: true, username: true } },
      bannedBy: { select: { id: true, username: true } },
    },
  })
  res.json(bans)
}))

// Ban user
router.post('/:id/bans', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.body
  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isAdmin) {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (room?.ownerId === userId) {
    res.status(400).json({ error: 'Cannot ban the owner' })
    return
  }
  const bannedUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
  await prisma.$transaction([
    prisma.roomBan.upsert({
      where: { userId_roomId: { userId, roomId: req.params.id } },
      create: { userId, roomId: req.params.id, bannedById: req.userId! },
      update: {},
    }),
    prisma.roomMember.deleteMany({ where: { userId, roomId: req.params.id } }),
    prisma.roomAdmin.deleteMany({ where: { userId, roomId: req.params.id } }),
  ])
  const io = (req as IoRequest).io
  if (io) {
    leaveUserFromRoom(io, userId, `room:${req.params.id}`)
    io.to(`room:${req.params.id}`).emit('member_banned', { roomId: req.params.id, userId, username: bannedUser?.username })
    io.to(`user:${userId}`).emit('removed_from_room', { roomId: req.params.id })
  }
  res.json({ ok: true })
}))

// Unban user
router.delete('/:id/bans/:userId', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isAdmin) {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  await prisma.roomBan.deleteMany({
    where: { userId: req.params.userId, roomId: req.params.id },
  })
  res.json({ ok: true })
}))

// Make admin
router.post('/:id/admins', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.body
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room || room.ownerId !== req.userId) {
    res.status(403).json({ error: 'Owner only' })
    return
  }
  const isMember = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId: req.params.id } },
  })
  if (!isMember) {
    res.status(400).json({ error: 'User is not a member' })
    return
  }
  await prisma.roomAdmin.upsert({
    where: { userId_roomId: { userId, roomId: req.params.id } },
    create: { userId, roomId: req.params.id },
    update: {},
  })
  ;(req as IoRequest).io?.to(`room:${req.params.id}`).emit('member_role_changed', { roomId: req.params.id, userId, isAdmin: true })
  res.json({ ok: true })
}))

// Remove admin
router.delete('/:id/admins/:userId', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isAdmin) {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  if (req.params.userId === room.ownerId) {
    res.status(400).json({ error: 'Cannot remove owner admin rights' })
    return
  }
  await prisma.roomAdmin.deleteMany({
    where: { userId: req.params.userId, roomId: req.params.id },
  })
  ;(req as IoRequest).io?.to(`room:${req.params.id}`).emit('member_role_changed', { roomId: req.params.id, userId: req.params.userId, isAdmin: false })
  res.json({ ok: true })
}))

// Kick member — removes from room without adding a ban (user can rejoin via invite)
router.delete('/:id/members/:userId', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isAdmin) {
    res.status(403).json({ error: 'Admins only' })
    return
  }
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (room?.ownerId === req.params.userId) {
    res.status(400).json({ error: 'Cannot remove the owner' })
    return
  }
  const kickedUser = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { username: true } })
  await prisma.$transaction([
    prisma.roomMember.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } }),
    prisma.roomAdmin.deleteMany({ where: { userId: req.params.userId, roomId: req.params.id } }),
  ])
  const io = (req as IoRequest).io
  if (io) {
    leaveUserFromRoom(io, req.params.userId, `room:${req.params.id}`)
    io.to(`room:${req.params.id}`).emit('member_kicked', { roomId: req.params.id, userId: req.params.userId, username: kickedUser?.username })
    io.to(`user:${req.params.userId}`).emit('removed_from_room', { roomId: req.params.id })
  }
  res.json({ ok: true })
}))

// Invite user to private room
router.post('/:id/invitations', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { username } = req.body
  const room = await prisma.room.findUnique({ where: { id: req.params.id } })
  if (!room) {
    res.status(404).json({ error: 'Room not found' })
    return
  }
  const isMember = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (!isMember) {
    res.status(403).json({ error: 'Not a member' })
    return
  }
  const target = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  await prisma.roomInvitation.upsert({
    where: { roomId_userId: { roomId: req.params.id, userId: target.id } },
    create: { roomId: req.params.id, userId: target.id, invitedById: req.userId! },
    update: {},
  })
  // Notify the invited user in real-time
  const inviterUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
  ;(req as IoRequest).io?.to(`user:${target.id}`).emit('room_invitation', {
    roomId: req.params.id,
    roomName: room.name,
    invitedBy: inviterUser?.username,
  })
  res.json({ ok: true })
}))

// Accept invitation
router.post('/:id/invitations/accept', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const inv = await prisma.roomInvitation.findUnique({
    where: { roomId_userId: { roomId: req.params.id, userId: req.userId! } },
  })
  if (!inv) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  const ban = await prisma.roomBan.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
  })
  if (ban) {
    res.status(403).json({ error: 'You are banned from this room' })
    return
  }
  const [, room] = await prisma.$transaction([
    prisma.roomMember.upsert({
      where: { userId_roomId: { userId: req.userId!, roomId: req.params.id } },
      create: { userId: req.userId!, roomId: req.params.id },
      update: {},
    }),
    prisma.room.findUnique({ where: { id: req.params.id } }),
    prisma.roomInvitation.delete({
      where: { roomId_userId: { roomId: req.params.id, userId: req.userId! } },
    }),
  ])
  const io = (req as IoRequest).io
  if (io && room) {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
    joinUserToRoom(io, req.userId!, `room:${req.params.id}`)
    io.to(`room:${req.params.id}`).emit('member_joined', { roomId: req.params.id, userId: req.userId, username: user?.username })
    io.to(`user:${req.userId!}`).emit('joined_room', { roomId: req.params.id, room: { id: room.id, name: room.name, description: room.description, type: room.type, ownerId: room.ownerId } })
  }
  res.json({ ok: true })
}))

export default router
