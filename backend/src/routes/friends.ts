import { Router, Response, Request } from 'express'
import { Server } from 'socket.io'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

interface IoRequest extends Request { io?: Server }

const router = Router()

function friendshipWhere(userAId: string, userBId: string) {
  return {
    OR: [
      { userAId, userBId },
      { userAId: userBId, userBId: userAId },
    ],
  }
}

// Get friend list
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: req.userId }, { userBId: req.userId }],
    },
    include: {
      userA: { select: { id: true, username: true } },
      userB: { select: { id: true, username: true } },
    },
  })
  const friends = friendships.map(f =>
    f.userAId === req.userId ? f.userB : f.userA
  )
  res.json(friends)
})

// Get pending friend requests
router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const received = await prisma.friendRequest.findMany({
    where: { recipientId: req.userId, status: 'PENDING' },
    include: { requester: { select: { id: true, username: true } } },
  })
  const sent = await prisma.friendRequest.findMany({
    where: { requesterId: req.userId, status: 'PENDING' },
    include: { recipient: { select: { id: true, username: true } } },
  })
  res.json({ received, sent })
})

// Send friend request
router.post('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const { username, message } = req.body
  if (!username) {
    res.status(400).json({ error: 'username required' })
    return
  }
  const target = await prisma.user.findUnique({ where: { username } })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (target.id === req.userId) {
    res.status(400).json({ error: 'Cannot add yourself' })
    return
  }
  const existing = await prisma.friendship.findFirst({ where: friendshipWhere(req.userId!, target.id) })
  if (existing) {
    res.status(409).json({ error: 'Already friends' })
    return
  }
  const ban = await prisma.userBan.findFirst({
    where: {
      OR: [
        { issuerId: req.userId, bannedId: target.id },
        { issuerId: target.id, bannedId: req.userId },
      ],
    },
  })
  if (ban) {
    res.status(403).json({ error: 'Cannot send request' })
    return
  }
  try {
    const req2 = await prisma.friendRequest.create({
      data: { requesterId: req.userId!, recipientId: target.id, message: message || '' },
    })
    const sender = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
    ;(req as IoRequest).io?.to(`user:${target.id}`).emit('friend_request', { username: sender?.username })
    res.status(201).json(req2)
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ error: 'Request already sent' })
      return
    }
    throw e
  }
})

// Accept friend request
router.post('/requests/:id/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } })
  if (!request || request.recipientId !== req.userId) {
    res.status(404).json({ error: 'Request not found' })
    return
  }
  await prisma.$transaction([
    prisma.friendRequest.update({ where: { id: req.params.id }, data: { status: 'ACCEPTED' } }),
    prisma.friendship.create({ data: { userAId: request.requesterId, userBId: request.recipientId } }),
  ])
  res.json({ ok: true })
})

// Decline friend request
router.post('/requests/:id/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } })
  if (!request || request.recipientId !== req.userId) {
    res.status(404).json({ error: 'Request not found' })
    return
  }
  await prisma.friendRequest.update({ where: { id: req.params.id }, data: { status: 'DECLINED' } })
  res.json({ ok: true })
})

// Remove friend
router.delete('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  await prisma.friendship.deleteMany({ where: friendshipWhere(req.userId!, req.params.userId) })
  res.json({ ok: true })
})

// Ban user
router.post('/bans', requireAuth, async (req: AuthRequest, res: Response) => {
  const { userId } = req.body
  if (!userId || userId === req.userId) {
    res.status(400).json({ error: 'invalid userId' })
    return
  }
  await prisma.$transaction(async tx => {
    await tx.userBan.upsert({
      where: { issuerId_bannedId: { issuerId: req.userId!, bannedId: userId } },
      create: { issuerId: req.userId!, bannedId: userId },
      update: {},
    })
    // remove friendship
    await tx.friendship.deleteMany({ where: friendshipWhere(req.userId!, userId) })
    // cancel pending requests
    await tx.friendRequest.updateMany({
      where: {
        status: 'PENDING',
        OR: [
          { requesterId: req.userId, recipientId: userId },
          { requesterId: userId, recipientId: req.userId },
        ],
      },
      data: { status: 'DECLINED' },
    })
  })
  res.json({ ok: true })
})

// Unban user
router.delete('/bans/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  await prisma.userBan.deleteMany({
    where: { issuerId: req.userId, bannedId: req.params.userId },
  })
  res.json({ ok: true })
})

// Get bans issued by me
router.get('/bans', requireAuth, async (req: AuthRequest, res: Response) => {
  const bans = await prisma.userBan.findMany({
    where: { issuerId: req.userId },
    include: { banned: { select: { id: true, username: true } } },
  })
  res.json(bans)
})

export default router
