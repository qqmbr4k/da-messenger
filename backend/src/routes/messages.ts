import { Router, Response, Request } from 'express'
import { Server } from 'socket.io'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

interface IoRequest extends Request { io?: Server }

const router = Router({ mergeParams: true })

const MESSAGE_SELECT = {
  id: true,
  seq: true,
  content: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  replyToId: true,
  forwardedFromId: true,
  author: { select: { id: true, username: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      author: { select: { id: true, username: true } },
    },
  },
  forwardedFrom: {
    select: {
      id: true,
      content: true,
      author: { select: { id: true, username: true } },
    },
  },
  attachments: {
    select: { id: true, filename: true, originalName: true, mimeType: true, size: true, comment: true },
  },
  reactions: {
    select: { id: true, emoji: true, userId: true, user: { select: { username: true } } },
  },
}

async function assertRoomAccess(roomId: string, userId: string) {
  return !!(await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId } } }))
}

/**
 * Atomically get the next seq for a room.
 * Uses an upsert + RETURNING to guarantee no two messages share a seq.
 */
async function nextRoomSeq(roomId: string): Promise<number> {
  const [row] = await prisma.$queryRaw<[{ seq: bigint }]>`
    INSERT INTO "RoomSeq" ("roomId", "seq")
    VALUES (${roomId}, 1)
    ON CONFLICT ("roomId")
    DO UPDATE SET "seq" = "RoomSeq"."seq" + 1
    RETURNING "seq"
  `
  return Number(row.seq)
}

// GET messages
// Supports three modes:
//   ?limit=50                       → latest N messages (initial load)
//   ?beforeSeq=N&limit=50           → older messages for infinite scroll
//   ?afterSeq=N&limit=100           → messages after a watermark (gap fill / reconnect sync)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  const { beforeSeq, afterSeq, limit = '50' } = req.query
  const take = Math.min(Number(limit), 200)

  const isInt = (v: unknown) => /^\d+$/.test(String(v))
  let seqFilter: object = {}
  if (afterSeq !== undefined) {
    if (!isInt(afterSeq)) { res.status(400).json({ error: 'afterSeq must be a non-negative integer' }); return }
    seqFilter = { seq: { gt: BigInt(String(afterSeq)) } }
  } else if (beforeSeq !== undefined) {
    if (!isInt(beforeSeq)) { res.status(400).json({ error: 'beforeSeq must be a non-negative integer' }); return }
    seqFilter = { seq: { lt: BigInt(String(beforeSeq)) } }
  }

  const orderDir = afterSeq !== undefined ? 'asc' : 'desc'

  const messages = await prisma.message.findMany({
    where: { roomId, deletedAt: null, ...seqFilter },
    select: MESSAGE_SELECT,
    orderBy: { seq: orderDir },
    take,
  })

  // For latest and beforeSeq queries return chronological order
  const result = afterSeq !== undefined ? messages : messages.reverse()

  // Serialize BigInt seq to number for JSON
  res.json(result.map(m => ({ ...m, seq: m.seq !== null ? Number(m.seq) : null })))
})

// POST send message
router.post('/', requireAuth, async (req: AuthRequest & IoRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }
  const { content, replyToId } = req.body
  if (!content || content.length > 3072) {
    res.status(400).json({ error: 'content required, max 3072 chars' })
    return
  }

  const seq = await nextRoomSeq(roomId)

  const message = await prisma.message.create({
    data: { roomId, authorId: req.userId!, content, seq, replyToId: replyToId || null },
    select: MESSAGE_SELECT,
  })

  const payload = { ...message, seq: Number(message.seq) }
  req.io?.to(`room:${roomId}`).emit('message', { ...payload, roomId })

  // Emit mention notifications to each @mentioned room member
  const mentionedUsernames = (content.match(/@([a-zA-Z0-9_]+)/g) ?? []).map((m: string) => m.slice(1))
  if (mentionedUsernames.length > 0 && req.io) {
    const mentionedUsers = await prisma.user.findMany({
      where: {
        username: { in: mentionedUsernames, mode: 'insensitive' },
        memberships: { some: { roomId } },
        id: { not: req.userId! },
      },
      select: { id: true },
    })
    const authorUsername = message.author.username
    for (const { id: mentionedId } of mentionedUsers) {
      req.io.to(`user:${mentionedId}`).emit('mentioned', {
        roomId,
        messageId: message.id,
        authorUsername,
        preview: content.slice(0, 100),
      })
    }
  }

  res.status(201).json(payload)
})

// PATCH edit
router.patch('/:messageId', requireAuth, async (req: AuthRequest & IoRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' }); return
  }
  const msg = await prisma.message.findUnique({ where: { id: req.params.messageId } })
  if (!msg || msg.deletedAt || msg.roomId !== roomId) { res.status(404).json({ error: 'Message not found' }); return }
  if (msg.authorId !== req.userId) { res.status(403).json({ error: 'Not your message' }); return }

  const { content } = req.body
  if (!content || content.length > 3072) { res.status(400).json({ error: 'content required, max 3072 chars' }); return }

  const updated = await prisma.message.update({
    where: { id: req.params.messageId },
    data: { content, editedAt: new Date() },
    select: MESSAGE_SELECT,
  })
  const payload = { ...updated, seq: Number(updated.seq) }
  req.io?.to(`room:${roomId}`).emit('message_edited', payload)
  res.json(payload)
})

// DELETE message
router.delete('/:messageId', requireAuth, async (req: AuthRequest & IoRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' }); return
  }
  const msg = await prisma.message.findUnique({ where: { id: req.params.messageId } })
  if (!msg || msg.deletedAt || msg.roomId !== roomId) { res.status(404).json({ error: 'Message not found' }); return }

  const isAdmin = await prisma.roomAdmin.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId } },
  })
  if (msg.authorId !== req.userId && !isAdmin) { res.status(403).json({ error: 'Forbidden' }); return }

  await prisma.message.update({ where: { id: req.params.messageId }, data: { deletedAt: new Date() } })
  req.io?.to(`room:${roomId}`).emit('message_deleted', { id: req.params.messageId, roomId })
  res.json({ ok: true })
})

// POST toggle emoji reaction on a message
router.post('/:messageId/reactions', requireAuth, async (req: AuthRequest & IoRequest, res: Response) => {
  const { roomId, messageId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' }); return
  }
  const { emoji } = req.body
  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
    res.status(400).json({ error: 'emoji required' }); return
  }

  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { roomId: true } })
  if (!message || message.roomId !== roomId) {
    res.status(404).json({ error: 'Message not found' }); return
  }

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: req.userId!, emoji } },
  })

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } })
  } else {
    await prisma.reaction.create({ data: { messageId, userId: req.userId!, emoji } })
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { id: true, emoji: true, userId: true, user: { select: { username: true } } },
  })

  req.io?.to(`room:${roomId}`).emit('reaction_updated', { messageId, reactions, roomId })
  res.json({ reactions })
})

// POST forward a message to another room (copies content + re-links attachments)
router.post('/:messageId/forward', requireAuth, async (req: AuthRequest & IoRequest, res: Response) => {
  const { roomId, messageId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' }); return
  }
  const { targetRoomId } = req.body
  if (!targetRoomId || typeof targetRoomId !== 'string') {
    res.status(400).json({ error: 'targetRoomId required' }); return
  }
  if (!(await assertRoomAccess(targetRoomId, req.userId!))) {
    res.status(403).json({ error: 'Not a member of target room' }); return
  }

  const original = await prisma.message.findUnique({
    where: { id: messageId, deletedAt: null },
    select: {
      content: true,
      roomId: true,
      author: { select: { id: true, username: true } },
      attachments: { select: { filename: true, originalName: true, mimeType: true, size: true, comment: true } },
    },
  })
  if (!original || original.roomId !== roomId) {
    res.status(404).json({ error: 'Message not found' }); return
  }

  const seq = await nextRoomSeq(targetRoomId)

  const newMsg = await prisma.message.create({
    data: {
      roomId: targetRoomId,
      authorId: req.userId!,
      content: original.content,
      seq,
      forwardedFromId: messageId,
      attachments: original.attachments.length > 0
        ? { create: original.attachments.map(a => ({ ...a })) }
        : undefined,
    },
    select: MESSAGE_SELECT,
  })

  const payload = { ...newMsg, seq: Number(newMsg.seq) }
  req.io?.to(`room:${targetRoomId}`).emit('message', { ...payload, roomId: targetRoomId })
  res.status(201).json(payload)
})

// GET room's current max seq (lets clients know if they're behind)
router.get('/seq', requireAuth, async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' })
    return
  }
  const row = await prisma.roomSeq.findUnique({ where: { roomId } })
  res.json({ roomId, seq: row ? Number(row.seq) : 0 })
})

// POST update the user's watermark for this room
router.post('/watermark', requireAuth, async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  if (!(await assertRoomAccess(roomId, req.userId!))) {
    res.status(403).json({ error: 'Access denied' }); return
  }
  const { seq } = req.body
  if (seq === undefined || seq === null) { res.status(400).json({ error: 'seq required' }); return }

  await prisma.userRoomWatermark.upsert({
    where: { userId_roomId: { userId: req.userId!, roomId } },
    create: { userId: req.userId!, roomId, lastSeq: BigInt(seq) },
    update: { lastSeq: BigInt(seq) },
  })
  res.json({ ok: true })
})

export default router
