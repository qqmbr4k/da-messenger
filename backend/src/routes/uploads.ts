import { Router, Response, Request, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

const router = Router({ mergeParams: true })

// Upload attachment to a message
router.post('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Max size: 20MB for files' })
      return
    }
    if (err) { next(err); return }
    // Images have a tighter 3MB cap; check after multer writes the file to disk.
    // (Multer's MIME type is only known mid-stream, so pre-disk rejection would
    //  require a custom storage engine — not worth it here.)
    if (req.file?.mimetype.startsWith('image/') && req.file.size > 3 * 1024 * 1024) {
      fs.unlinkSync(req.file.path)
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
    fs.unlinkSync(req.file.path)
    res.status(403).json({ error: 'Not a member' })
    return
  }

  const { messageId, comment } = req.body
  if (!messageId) {
    fs.unlinkSync(req.file.path)
    res.status(400).json({ error: 'messageId required' })
    return
  }

  const attachment = await prisma.attachment.create({
    data: {
      messageId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      comment: comment || '',
    },
  })
  res.status(201).json(attachment)
})

// Download file
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
  const filePath = path.join(UPLOAD_DIR, attachment.filename)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' })
    return
  }
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`)
  res.sendFile(filePath)
})

export default router
