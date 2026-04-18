import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt'
import prisma from '../lib/prisma'

export interface AuthRequest extends Request {
  userId?: string
  sessionId?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = verifyToken(token)
    const session = await prisma.session.findUnique({ where: { id: payload.sessionId } })
    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: 'Session expired' })
      return
    }
    req.userId = payload.userId
    req.sessionId = payload.sessionId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
