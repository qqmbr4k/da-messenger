import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

// Get or create DM room between me and another user
router.post('/open', requireAuth, async (req: AuthRequest, res: Response) => {
  const { userId } = req.body
  if (!userId || userId === req.userId) {
    res.status(400).json({ error: 'invalid userId' })
    return
  }

  // Check friendship
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: req.userId, userBId: userId },
        { userAId: userId, userBId: req.userId },
      ],
    },
  })
  if (!friendship) {
    res.status(403).json({ error: 'You must be friends to message this user' })
    return
  }

  // Check bans
  const ban = await prisma.userBan.findFirst({
    where: {
      OR: [
        { issuerId: req.userId, bannedId: userId },
        { issuerId: userId, bannedId: req.userId },
      ],
    },
  })
  if (ban) {
    res.status(403).json({ error: 'Messaging is blocked' })
    return
  }

  // DM room names are deterministic: dm:{sorted UUIDs}
  const roomName = `dm:${[req.userId!, userId].sort().join(':')}`
  const existing = await prisma.room.findUnique({ where: { name: roomName } })
  if (existing) {
    res.json(existing)
    return
  }

  const otherUser = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
  const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })

  const room = await prisma.$transaction(async tx => {
    const r = await tx.room.create({
      data: { name: roomName, type: 'DIRECT', description: `${me?.username} & ${otherUser?.username}` },
    })
    await tx.roomMember.createMany({
      data: [
        { userId: req.userId!, roomId: r.id },
        { userId, roomId: r.id },
      ],
    })
    return r
  })
  res.status(201).json(room)
})

export default router
