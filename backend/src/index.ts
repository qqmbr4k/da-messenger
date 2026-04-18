import express from 'express'
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
import { xmppBridge } from './xmpp/bridge'

const app = express()
const server = http.createServer(app)

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const PORT = Number(process.env.PORT) || 4000
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, credentials: true },
})

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(cookieParser())
app.use(express.json())

// Attach io to every request so routes can emit events
app.use((req: express.Request & { io?: Server }, _res, next) => {
  req.io = io
  next()
})

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/rooms/:roomId/messages', messagesRouter)
app.use('/api/rooms/:roomId/files', uploadsRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/users', usersRouter)
app.use('/api/directs', directsRouter)
app.use('/api/xmpp', xmppRouter)

setupPresence(io)

// Start XMPP bridge (non-fatal — chat works without ejabberd)
xmppBridge.setIo(io)
if (process.env.XMPP_ENABLED !== 'false') {
  setTimeout(() => xmppBridge.connect(), 5000) // give ejabberd time to start
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export { io }
