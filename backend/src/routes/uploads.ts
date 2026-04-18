import { Router, Response, Request } from 'express'
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

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/')
    const maxSize = isImage ? 3 * 1024 * 1024 : 20 * 1024 * 1024
    // multer doesn't have size at filter time; enforce in route
    cb(null, true)
    void maxSize
  },
})

const router = Router({ mergeParams: true })

// Upload attachment to a message
router.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params
  if (!req.file) {
    res.status(400).json({ error: 'file required' })
    return
  }

  const isImage = req.file.mimetype.startsWith('image/')
  const maxBytes = isImage ? 3 * 1024 * 1024 : 20 * 1024 * 1024
  if (req.file.size > maxBytes) {
    fs.unlinkSync(req.file.path)
    res.status(413).json({ error: `Max size: ${isImage ? '3MB for images' : '20MB for files'}` })
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
