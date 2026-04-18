import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getUserStatus } from '../services/presence'

const router = Router()

router.get('/search', requireAuth, async (req: AuthRequest, res: Response) => {
  const { username } = req.query
  if (!username) {
    res.status(400).json({ error: 'username query required' })
    return
  }
  const users = await prisma.user.findMany({
    where: { username: { contains: String(username), mode: 'insensitive' } },
    select: { id: true, username: true },
    take: 20,
  })
  res.json(users)
})

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, createdAt: true },
  })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  // Check friendship/ban status relative to requester
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: req.userId, userBId: target.id },
        { userAId: target.id, userBId: req.userId },
      ],
    },
  })
  const ban = await prisma.userBan.findFirst({
    where: {
      OR: [
        { issuerId: req.userId, bannedId: target.id },
        { issuerId: target.id, bannedId: req.userId },
      ],
    },
  })
  const pendingRequest = await prisma.friendRequest.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { requesterId: req.userId, recipientId: target.id },
        { requesterId: target.id, recipientId: req.userId },
      ],
    },
  })
  res.json({
    ...target,
    status: getUserStatus(target.id),
    isFriend: !!friendship,
    isBanned: !!ban,
    hasPendingRequest: !!pendingRequest,
  })
})

router.get('/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ userId: req.params.id, status: getUserStatus(req.params.id) })
})

export default router
