import { Router } from 'express'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

function parseQuery(raw: string): {
  text: string
  inRoomName: string | null
  inUsername: string | null
  fromUsername: string | null
} {
  let text = raw
  let inRoomName: string | null = null
  let inUsername: string | null = null
  let fromUsername: string | null = null

  text = text.replace(/\bin:#(\S+)/gi, (_, name) => { inRoomName = name; return '' })
  text = text.replace(/\bin:@(\S+)/gi, (_, name) => { inUsername = name; return '' })
  text = text.replace(/\bfrom:@(\S+)/gi, (_, name) => { fromUsername = name; return '' })

  return { text: text.trim(), inRoomName, inUsername, fromUsername }
}

interface SearchMessage {
  id: string
  roomId: string
  authorId: string
  content: string
  seq: bigint | null
  createdAt: Date
  authorUsername: string
  roomName: string
  roomType: string
  roomDescription: string
  snippet: string
  rank: number
}

interface SearchAttachment {
  id: string
  messageId: string
  originalName: string
  mimeType: string
  size: number
  createdAt: Date
  roomId: string
  messageSeq: bigint | null
  authorId: string
  authorUsername: string
  roomName: string
  roomType: string
}

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const { q = '', limit = '20', offset = '0' } = req.query as Record<string, string>

    if (!q.trim()) {
      res.json({ messages: [], attachments: [] })
      return
    }

    const lim = Math.min(Number(limit) || 20, 50)
    const off = Number(offset) || 0
    const { text, inRoomName, inUsername, fromUsername } = parseQuery(q)

    // Determine which rooms the user can see
    const memberRooms = await prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    })
    let accessibleRoomIds = memberRooms.map(r => r.roomId)
    if (accessibleRoomIds.length === 0) {
      res.json({ messages: [], attachments: [] })
      return
    }

    if (inRoomName) {
      const room = await prisma.room.findFirst({
        where: { name: { equals: inRoomName, mode: 'insensitive' }, members: { some: { userId } } },
        select: { id: true },
      })
      if (!room) { res.json({ messages: [], attachments: [] }); return }
      accessibleRoomIds = [room.id]
    }

    if (inUsername) {
      const peer = await prisma.user.findFirst({
        where: { username: { equals: inUsername, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!peer) { res.json({ messages: [], attachments: [] }); return }
      const dmRoom = await prisma.room.findFirst({
        where: {
          type: 'DIRECT',
          members: { some: { userId } },
          AND: [{ members: { some: { userId: peer.id } } }],
        },
        select: { id: true },
      })
      if (!dmRoom) { res.json({ messages: [], attachments: [] }); return }
      accessibleRoomIds = [dmRoom.id]
    }

    let fromAuthorId: string | null = null
    if (fromUsername) {
      const author = await prisma.user.findFirst({
        where: { username: { equals: fromUsername, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!author) { res.json({ messages: [], attachments: [] }); return }
      fromAuthorId = author.id
    }

    let messages: SearchMessage[] = []
    let attachments: SearchAttachment[] = []

    if (text) {
      // Message FTS — two variants based on fromAuthorId filter
      if (fromAuthorId) {
        messages = await prisma.$queryRaw<SearchMessage[]>`
          SELECT
            m.id, m."roomId", m."authorId", m.content, m.seq, m."createdAt",
            u.username AS "authorUsername",
            r.name AS "roomName", r.type AS "roomType", r.description AS "roomDescription",
            ts_headline('english', m.content,
              websearch_to_tsquery('english', ${text}),
              'MaxWords=20,MinWords=5,ShortWord=2,HighlightAll=FALSE,MaxFragments=1,FragmentDelimiter=…'
            ) AS snippet,
            ts_rank(m.search_vector, websearch_to_tsquery('english', ${text})) AS rank
          FROM "Message" m
          JOIN "User" u ON u.id = m."authorId"
          JOIN "Room" r ON r.id = m."roomId"
          WHERE m."deletedAt" IS NULL
            AND m."roomId" = ANY(${accessibleRoomIds})
            AND m."authorId" = ${fromAuthorId}
            AND m.search_vector @@ websearch_to_tsquery('english', ${text})
          ORDER BY rank DESC, m."createdAt" DESC
          LIMIT ${lim} OFFSET ${off}
        `
      } else {
        messages = await prisma.$queryRaw<SearchMessage[]>`
          SELECT
            m.id, m."roomId", m."authorId", m.content, m.seq, m."createdAt",
            u.username AS "authorUsername",
            r.name AS "roomName", r.type AS "roomType", r.description AS "roomDescription",
            ts_headline('english', m.content,
              websearch_to_tsquery('english', ${text}),
              'MaxWords=20,MinWords=5,ShortWord=2,HighlightAll=FALSE,MaxFragments=1,FragmentDelimiter=…'
            ) AS snippet,
            ts_rank(m.search_vector, websearch_to_tsquery('english', ${text})) AS rank
          FROM "Message" m
          JOIN "User" u ON u.id = m."authorId"
          JOIN "Room" r ON r.id = m."roomId"
          WHERE m."deletedAt" IS NULL
            AND m."roomId" = ANY(${accessibleRoomIds})
            AND m.search_vector @@ websearch_to_tsquery('english', ${text})
          ORDER BY rank DESC, m."createdAt" DESC
          LIMIT ${lim} OFFSET ${off}
        `
      }

      // Attachment filename search — prefix match via :* tsquery
      // Sanitize: keep only word characters and dots, split to terms, join with &
      const attQuery = text.trim()
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9._-]/g, ''))
        .filter(Boolean)
        .join(' & ')
      if (attQuery) {
        if (fromAuthorId) {
          attachments = await prisma.$queryRaw<SearchAttachment[]>`
            SELECT
              a.id, a."messageId", a."originalName", a."mimeType", a.size, a."createdAt",
              m."roomId", m.seq AS "messageSeq", m."authorId",
              u.username AS "authorUsername",
              r.name AS "roomName", r.type AS "roomType"
            FROM "Attachment" a
            JOIN "Message" m ON m.id = a."messageId"
            JOIN "User"    u ON u.id = m."authorId"
            JOIN "Room"    r ON r.id = m."roomId"
            WHERE m."deletedAt" IS NULL
              AND m."roomId" = ANY(${accessibleRoomIds})
              AND m."authorId" = ${fromAuthorId}
              AND to_tsvector('simple', a."originalName") @@ to_tsquery('simple', ${attQuery + ':*'})
            ORDER BY a."createdAt" DESC
            LIMIT ${lim} OFFSET ${off}
          `
        } else {
          attachments = await prisma.$queryRaw<SearchAttachment[]>`
            SELECT
              a.id, a."messageId", a."originalName", a."mimeType", a.size, a."createdAt",
              m."roomId", m.seq AS "messageSeq", m."authorId",
              u.username AS "authorUsername",
              r.name AS "roomName", r.type AS "roomType"
            FROM "Attachment" a
            JOIN "Message" m ON m.id = a."messageId"
            JOIN "User"    u ON u.id = m."authorId"
            JOIN "Room"    r ON r.id = m."roomId"
            WHERE m."deletedAt" IS NULL
              AND m."roomId" = ANY(${accessibleRoomIds})
              AND to_tsvector('simple', a."originalName") @@ to_tsquery('simple', ${attQuery + ':*'})
            ORDER BY a."createdAt" DESC
            LIMIT ${lim} OFFSET ${off}
          `
        }
      }
    } else {
      // Only filters, no text — return recent messages in filtered scope
      const rows = await prisma.message.findMany({
        where: {
          deletedAt: null,
          roomId: { in: accessibleRoomIds },
          ...(fromAuthorId ? { authorId: fromAuthorId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: lim,
        skip: off,
        select: {
          id: true, roomId: true, authorId: true, content: true, seq: true, createdAt: true,
          author: { select: { username: true } },
          room: { select: { name: true, type: true, description: true } },
        },
      })
      messages = rows.map(r => ({
        id: r.id, roomId: r.roomId, authorId: r.authorId,
        content: r.content, seq: r.seq, createdAt: r.createdAt,
        authorUsername: r.author.username,
        roomName: r.room.name, roomType: r.room.type, roomDescription: r.room.description,
        snippet: r.content.slice(0, 150),
        rank: 0,
      }))
    }

    // Serialize BigInt seq fields to numbers
    const serialized = {
      messages: messages.map(m => ({ ...m, seq: m.seq != null ? Number(m.seq) : null })),
      attachments: attachments.map(a => ({ ...a, messageSeq: a.messageSeq != null ? Number(a.messageSeq) : null })),
    }

    res.json(serialized)
  } catch (err) {
    console.error('[search] error:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
