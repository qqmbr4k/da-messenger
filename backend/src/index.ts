import 'express-async-errors'
import express, { Request, Response, NextFunction } from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import authRouter from './routes/auth'
import roomsRouter from './routes/rooms'
import messagesRouter from './routes/messages'
import uploadsRouter from './routes/uploads'
import friendsRouter from './routes/friends'
import usersRouter from './routes/users'
import directsRouter from './routes/directs'
import { setupPresence } from './services/presence'
import xmppRouter from './routes/xmpp'
import searchRouter from './routes/search'
import { xmppBridge } from './xmpp/bridge'

if (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === 'supersecretjwtkey_change_in_prod') {
  console.warn('[WARN] JWT_SECRET is using an insecure default. Set JWT_SECRET in production.')
}

const app = express()
const server = http.createServer(app)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const PORT = Number(process.env.PORT) || 4000
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// Allow localhost and any 192.168.x.x / 10.x.x.x LAN origin on the same port
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/

function corsOrigin(origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) {
  if (!origin || origin === FRONTEND_URL || LOCAL_ORIGIN.test(origin)) return cb(null, true)
  cb(new Error(`CORS: origin ${origin} not allowed`))
}

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
})

app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(cookieParser())
app.use(express.json())
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next() })

// Attach io to every request so routes can emit events
app.use((req: express.Request & { io?: Server }, _res, next) => {
  req.io = io
  next()
})

app.get('/healthz', (_req, res) => { res.send('ok') })

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/rooms/:roomId/messages', messagesRouter)
app.use('/api/rooms/:roomId/files', uploadsRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/users', usersRouter)
app.use('/api/directs', directsRouter)
app.use('/api/xmpp', xmppRouter)
app.use('/api/search', searchRouter)

setupPresence(io)

// Start XMPP bridge (non-fatal — chat works without ejabberd)
xmppBridge.setIo(io)
if (process.env.XMPP_ENABLED !== 'false') {
  setTimeout(() => xmppBridge.connect(), 5000) // give ejabberd time to start
}

// Global error handler — prevents stack traces leaking in 500 responses
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export { io }
