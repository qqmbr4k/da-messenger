import { Router, Request, Response } from 'express'
import argon2 from 'argon2'
import { v4 as uuidv4 } from 'uuid'
import prisma from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const EJABBERD_API = process.env.EJABBERD_API_URL || 'http://ejabberd:5280'
const XMPP_HOST = 'xmpp.localhost'

async function ejabberdRegister(username: string, password: string) {
  try {
    await fetch(`${EJABBERD_API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, host: XMPP_HOST, password }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Non-fatal — ejabberd may not be running
  }
}

async function ejabberdChangePassword(username: string, newPassword: string) {
  try {
    await fetch(`${EJABBERD_API}/api/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, host: XMPP_HOST, newpass: newPassword }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Non-fatal
  }
}

async function ejabberdUnregister(username: string) {
  try {
    await fetch(`${EJABBERD_API}/api/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username, host: XMPP_HOST }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Non-fatal
  }
}

function sessionExpiry() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d
}

router.post('/register', async (req: Request, res: Response) => {
  const { email, username, password } = req.body
  if (!email || !username || !password) {
    res.status(400).json({ error: 'email, username and password are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  try {
    const hashed = await argon2.hash(password)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), username: username.toLowerCase(), password: hashed },
      select: { id: true, email: true, username: true, createdAt: true },
    })
    // Sync to ejabberd (non-fatal if ejabberd not running)
    ejabberdRegister(username, password)
    res.status(201).json(user)
  } catch (e: any) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.includes('email') ? 'Email' : 'Username'
      res.status(409).json({ error: `${field} already taken` })
      return
    }
    throw e
  }
})

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user || !(await argon2.verify(user.password, password))) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const sessionId = uuidv4()
  const token = signToken({ userId: user.id, sessionId })
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      token,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null,
      expiresAt: sessionExpiry(),
    },
  })
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000,
  })
  res.json({ id: user.id, email: user.email, username: user.username })
})

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => {})
  res.clearCookie('token')
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, username: true, createdAt: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(user)
})

router.get('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.userId },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(sessions.map(s => ({ ...s, isCurrent: s.id === req.sessionId })))
})

router.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.id } })
  if (!session || session.userId !== req.userId) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  await prisma.session.delete({ where: { id: req.params.id } })
  if (req.params.id === req.sessionId) res.clearCookie('token')
  res.json({ ok: true })
})

router.put('/password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword required' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } })
  if (!user || !(await argon2.verify(user.password, currentPassword))) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }
  const hashed = await argon2.hash(newPassword)
  await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } })
  ejabberdChangePassword(user.username, newPassword)
  res.json({ ok: true })
})

router.delete('/account', requireAuth, async (req: AuthRequest, res: Response) => {
  const { password } = req.body
  if (!password) {
    res.status(400).json({ error: 'password required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } })
  if (!user || !(await argon2.verify(user.password, password))) {
    res.status(401).json({ error: 'Password is incorrect' })
    return
  }
  // Delete rooms owned by this user (cascades to messages + attachments)
  await prisma.room.deleteMany({ where: { ownerId: req.userId } })
  await prisma.user.delete({ where: { id: req.userId } })
  ejabberdUnregister(user.username)
  res.clearCookie('token')
  res.json({ ok: true })
})

// Password reset — generate a reset token (stored as a session with short TTL)
// No email required per spec; token is returned for the user to use
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) {
    res.status(400).json({ error: 'email required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  // Always return 200 to avoid user enumeration
  if (!user) {
    res.json({ message: 'If that email exists, a reset token has been generated.' })
    return
  }
  // Clean up any existing (possibly expired) reset tokens for this user
  await prisma.session.deleteMany({
    where: { userId: user.id, token: { startsWith: 'reset:' } },
  })
  const resetToken = uuidv4()
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  await prisma.session.create({
    data: {
      userId: user.id,
      token: `reset:${resetToken}`,
      expiresAt: expires,
    },
  })
  // In production this would be emailed. For this demo we return it directly.
  res.json({ resetToken, message: 'Use this token with /api/auth/reset-password' })
})

router.post('/reset-password', async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body
  if (!resetToken || !newPassword) {
    res.status(400).json({ error: 'resetToken and newPassword required' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  const session = await prisma.session.findUnique({ where: { token: `reset:${resetToken}` } })
  if (!session || session.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired reset token' })
    return
  }
  const hashed = await argon2.hash(newPassword)
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.userId }, data: { password: hashed } }),
    prisma.session.delete({ where: { token: `reset:${resetToken}` } }),
    // Invalidate all other sessions for security
    prisma.session.deleteMany({ where: { userId: session.userId } }),
  ])
  res.json({ ok: true, message: 'Password reset. Please log in again.' })
})

export default router
