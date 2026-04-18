import { Router, Request, Response } from 'express'
import argon2 from 'argon2'
import prisma from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { xmppBridge } from '../xmpp/bridge'

const router = Router()

// --- ejabberd HTTP auth endpoints ---
// ejabberd calls these with `?user=X&host=Y&password=Z` query params

router.get('/auth/check', async (req: Request, res: Response) => {
  const { user, password } = req.query as Record<string, string>
  if (!user || !password) { res.status(400).json({ result: 'error' }); return }
  const dbUser = await prisma.user.findFirst({ where: { username: user } })
  if (!dbUser) { res.json({ result: 'false' }); return }
  const ok = await argon2.verify(dbUser.password, password)
  res.json({ result: ok ? 'true' : 'false' })
})

router.get('/auth/exists', async (req: Request, res: Response) => {
  const { user } = req.query as Record<string, string>
  if (!user) { res.json({ result: 'false' }); return }
  const dbUser = await prisma.user.findFirst({ where: { username: user } })
  res.json({ result: dbUser ? 'true' : 'false' })
})

// ejabberd mod_auth_http expects POST with JSON body
router.post('/auth', async (req: Request, res: Response) => {
  const { user, host, password } = req.body
  if (!user || !password) { res.status(400).json({ result: 'error' }); return }
  const dbUser = await prisma.user.findFirst({ where: { username: user } })
  if (!dbUser) { res.json({ result: false }); return }
  const ok = await argon2.verify(dbUser.password, password)
  res.json({ result: ok })
})

router.post('/auth/register', async (req: Request, res: Response) => {
  // ejabberd calls this when a new XMPP account is created via the client
  // We don't auto-create web accounts from XMPP registration — just confirm existence
  const { user } = req.body
  const dbUser = await prisma.user.findFirst({ where: { username: user } })
  res.json({ result: !!dbUser })
})

// --- Admin stats API ---

router.get('/stats', requireAuth, async (_req: AuthRequest, res: Response) => {
  const stats = xmppBridge.getStats()

  // Try to fetch ejabberd stats via its HTTP API
  let ejabberdStats: any = null
  try {
    const ejabberdBase = process.env.EJABBERD_API_URL || 'http://ejabberd:5280'
    const r = await fetch(`${ejabberdBase}/api/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'registeredusers' }),
      signal: AbortSignal.timeout(2000),
    })
    if (r.ok) ejabberdStats = { registeredUsers: await r.json() }
  } catch {
    // ejabberd may not be running or accessible
  }

  res.json({ bridge: stats, ejabberd: ejabberdStats })
})

router.get('/sessions', requireAuth, async (_req: AuthRequest, res: Response) => {
  // Fetch connected client sessions from ejabberd
  let sessions: any[] = []
  try {
    const ejabberdBase = process.env.EJABBERD_API_URL || 'http://ejabberd:5280'
    const r = await fetch(`${ejabberdBase}/api/connected_users_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(2000),
    })
    if (r.ok) sessions = (await r.json()) as any[]
  } catch {
    // ejabberd unavailable
  }
  res.json(sessions)
})

router.get('/federation', requireAuth, async (_req: AuthRequest, res: Response) => {
  let s2sSessions: any[] = []
  try {
    const ejabberdBase = process.env.EJABBERD_API_URL || 'http://ejabberd:5280'
    const r = await fetch(`${ejabberdBase}/api/outgoing_s2s_number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(2000),
    })
    if (r.ok) s2sSessions = (await r.json()) as any[]
  } catch {
    // ejabberd unavailable
  }
  res.json({ s2sSessions, bridgeStats: xmppBridge.getStats() })
})

export default router
