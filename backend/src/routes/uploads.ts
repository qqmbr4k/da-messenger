import { Router, Response, Request, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import prisma from '../lib/prisma'
import s3, { S3_BUCKET } from '../lib/s3'
import { requireAuth, AuthRequest } from '../middleware/auth'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
  'application/pdf',
  'application/zip', 'application/x-tar', 'application/gzip',
  'application/json', 'application/xml',
  'text/plain', 'text/csv', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
])

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'])

const router = Router({ mergeParams: true })

// Upload attachment to a message
router.post('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Max size: 20MB for files' })
      return
    }
    if (err) { next(err); return }
    if (req.file && !ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      res.status(415).json({ error: 'File type not allowed' })
      return
    }
    if (req.file?.mimetype.startsWith('image/') && req.file.size > 3 * 1024 * 1024) {
      res.status(413).json({ error: 'Max size: 3MB for images' })
      return
    }
    next()
  })
}, async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  if (!req.file) {
    res.status(400).json({ error: 'file required' })
    return
  }

  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId } },
  })
  if (!member) {
    res.status(403).json({ error: 'Not a member' })
    return
  }

  const { messageId, comment } = req.body
  if (!messageId) {
    res.status(400).json({ error: 'messageId required' })
    return
  }

  const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { roomId: true } })
  if (!msg || msg.roomId !== roomId) {
    res.status(404).json({ error: 'Message not found' })
    return
  }

  const ext = path.extname(req.file.originalname)
  const s3Key = `${uuidv4()}${ext}`

  try {
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }))
  } catch {
    res.status(500).json({ error: 'Storage unavailable' })
    return
  }

  const attachment = await prisma.attachment.create({
    data: {
      messageId,
      filename: s3Key,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      comment: comment || '',
    },
  })
  res.status(201).json(attachment)
})

// List all attachments in this room
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId } },
  })
  if (!member) { res.status(403).json({ error: 'Access denied' }); return }

  const attachments = await prisma.attachment.findMany({
    where: { message: { roomId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, filename: true, originalName: true, mimeType: true, size: true, comment: true, createdAt: true,
      message: { select: { id: true, author: { select: { id: true, username: true } } } },
    },
  })
  res.json(attachments)
})

// Download file — stream from S3
router.get('/:attachmentId', requireAuth, async (req: AuthRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({
    where: { id: req.params.attachmentId },
    include: { message: { select: { roomId: true } } },
  })
  if (!attachment) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const member = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: req.userId!, roomId: attachment.message.roomId } },
  })
  if (!member) {
    res.status(403).json({ error: 'Access denied' })
    return
  }

  let s3Res
  try {
    s3Res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: attachment.filename }))
  } catch {
    res.status(404).json({ error: 'File not found' })
    return
  }
  const disposition = INLINE_TYPES.has(attachment.mimeType) ? 'inline' : 'attachment'
  res.setHeader('Content-Type', attachment.mimeType)
  const ascii = attachment.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')
  const safeFilename = encodeURIComponent(attachment.originalName).replace(/'/g, '%27')
  res.setHeader('Content-Disposition', `${disposition}; filename="${ascii}"; filename*=UTF-8''${safeFilename}`)
  if (s3Res.ContentLength) res.setHeader('Content-Length', s3Res.ContentLength)
  ;(s3Res.Body as Readable).pipe(res)
})

export default router
