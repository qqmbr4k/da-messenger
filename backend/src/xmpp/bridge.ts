/**
 * XEP-0114 Jabber Component Protocol bridge.
 * Connects to ejabberd as an external component, routing messages
 * between the XMPP world and our REST/WebSocket chat system.
 */

import net from 'net'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { XMLParser } from 'fast-xml-parser'
import prisma from '../lib/prisma'

const COMPONENT_DOMAIN = process.env.XMPP_COMPONENT_DOMAIN || 'chat.xmpp.localhost'
const COMPONENT_SECRET = process.env.XMPP_COMPONENT_SECRET || 'bridgesecret'
const EJABBERD_HOST = process.env.EJABBERD_HOST || 'ejabberd'
const EJABBERD_PORT = Number(process.env.EJABBERD_COMPONENT_PORT) || 5275

export interface XmppStats {
  connected: boolean
  connectedAt: Date | null
  domain: string
  ejabberdHost: string
  messagesIn: number
  messagesOut: number
  reconnectAttempts: number
  federationSessions: number
}

class XmppBridge extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private stats: XmppStats = {
    connected: false,
    connectedAt: null,
    domain: COMPONENT_DOMAIN,
    ejabberdHost: EJABBERD_HOST,
    messagesIn: 0,
    messagesOut: 0,
    reconnectAttempts: 0,
    federationSessions: 0,
  }
  private io: any = null
  private reconnectTimer: NodeJS.Timeout | null = null

  setIo(io: any) {
    this.io = io
  }

  getStats(): XmppStats {
    return { ...this.stats }
  }

  connect() {
    if (this.socket) return
    this.socket = new net.Socket()

    this.socket.on('connect', () => {
      this.send(
        `<?xml version='1.0'?><stream:stream xmlns='jabber:component:accept' ` +
        `xmlns:stream='http://etherx.jabber.org/streams' to='${COMPONENT_DOMAIN}'>`
      )
    })

    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf8')
      this.processBuffer()
    })

    this.socket.on('error', (err: Error) => {
      console.error('[XMPP Bridge] Socket error:', err.message)
    })

    this.socket.on('close', () => {
      console.log('[XMPP Bridge] Disconnected, will retry in 10s')
      this.stats.connected = false
      this.stats.connectedAt = null
      this.socket = null
      this.reconnectTimer = setTimeout(() => {
        this.stats.reconnectAttempts++
        this.connect()
      }, 10_000)
    })

    console.log(`[XMPP Bridge] Connecting to ${EJABBERD_HOST}:${EJABBERD_PORT}...`)
    this.socket.connect(EJABBERD_PORT, EJABBERD_HOST)
  }

  private send(xml: string) {
    this.socket?.write(xml, 'utf8')
  }

  private processBuffer() {
    // Handle stream open handshake
    const idMatch = this.buffer.match(/id='([^']+)'/)
    if (idMatch && !this.stats.connected && this.buffer.includes('<stream:stream')) {
      const streamId = idMatch[1]
      const handshake = crypto
        .createHash('sha1')
        .update(streamId + COMPONENT_SECRET)
        .digest('hex')
      this.send(`<handshake>${handshake}</handshake>`)
      this.buffer = ''
      return
    }

    if (this.buffer.includes('<handshake/>') && !this.stats.connected) {
      this.stats.connected = true
      this.stats.connectedAt = new Date()
      this.buffer = ''
      console.log('[XMPP Bridge] Authenticated and connected')
      return
    }

    // Parse complete stanzas (simple extraction)
    this.extractStanzas()
  }

  private extractStanzas() {
    // Pull complete top-level stanzas from the buffer
    const stanzaPattern = /<(message|presence|iq)(\s[^>]*)?>[\s\S]*?<\/\1>|<(message|presence|iq)(\s[^>]*)?\/>/gi
    let match
    const processed: string[] = []

    while ((match = stanzaPattern.exec(this.buffer)) !== null) {
      this.handleStanza(match[0])
      processed.push(match[0])
    }

    if (processed.length > 0) {
      // Remove processed stanzas from buffer
      for (const s of processed) {
        this.buffer = this.buffer.replace(s, '')
      }
    }
  }

  private handleStanza(xml: string) {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    let parsed: any
    try {
      parsed = parser.parse(xml)
    } catch {
      return
    }

    const stanza = parsed.message || parsed.presence || parsed.iq
    if (!stanza) return

    if (parsed.message) {
      this.handleMessage(stanza, xml)
    } else if (parsed.presence) {
      this.handlePresence(stanza)
    }
  }

  private async handleMessage(stanza: any, raw: string) {
    const from: string = stanza['@_from'] || ''
    const to: string = stanza['@_to'] || ''
    const body = stanza.body

    if (!body || typeof body !== 'string') return
    if (!from || !to) return

    // Extract username from JID (user@domain/resource)
    const fromUser = from.split('@')[0]
    // to could be user@chat.xmpp.localhost (for DM) or room@conference (MUC, handled by ejabberd)
    const toUser = to.split('@')[0]

    this.stats.messagesIn++

    try {
      // Find sender in our DB by username
      const sender = await prisma.user.findFirst({ where: { username: fromUser } })
      if (!sender) return

      // Find recipient by username
      const recipient = await prisma.user.findFirst({ where: { username: toUser } })
      if (!recipient) return

      // Check if they're friends (required for DMs)
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: sender.id, userBId: recipient.id },
            { userAId: recipient.id, userBId: sender.id },
          ],
        },
      })
      if (!friendship) return

      // Find or create DM room
      const dmTag = [sender.id, recipient.id].sort().join(':')
      let room = await prisma.room.findFirst({
        where: { type: 'DIRECT', name: { startsWith: `dm:${dmTag}` } },
      })
      if (!room) {
        room = await prisma.room.create({
          data: {
            name: `dm:${dmTag}:${Date.now()}`,
            description: `${sender.username} & ${recipient.username}`,
            type: 'DIRECT',
            members: { create: [{ userId: sender.id }, { userId: recipient.id }] },
          },
        })
      }

      // Assign seq
      const [seqRow] = await prisma.$queryRaw<[{ seq: bigint }]>`
        INSERT INTO "RoomSeq" ("roomId", "seq") VALUES (${room.id}, 1)
        ON CONFLICT ("roomId") DO UPDATE SET "seq" = "RoomSeq"."seq" + 1
        RETURNING "seq"
      `
      const seq = Number(seqRow.seq)

      const msg = await prisma.message.create({
        data: {
          roomId: room.id,
          authorId: sender.id,
          content: body,
          seq,
        },
        include: {
          author: { select: { id: true, username: true } },
          replyTo: { include: { author: { select: { id: true, username: true } } } },
          attachments: true,
        },
      })

      const payload = { ...msg, seq: Number(msg.seq), roomId: room.id }
      this.io?.to(room.id).emit('message', payload)
    } catch (err) {
      console.error('[XMPP Bridge] handleMessage error:', err)
    }
  }

  private handlePresence(stanza: any) {
    // Presence tracking could be extended here
  }

  // Called by our message routes to forward web messages to XMPP
  forwardToXmpp(opts: {
    fromUsername: string
    toUsername: string
    body: string
    messageId: string
  }) {
    if (!this.stats.connected) return
    const stanza = [
      `<message from='${opts.fromUsername}@${COMPONENT_DOMAIN}'`,
      ` to='${opts.toUsername}@xmpp.localhost'`,
      ` type='chat'`,
      ` id='${opts.messageId}'>`,
      `<body>${escapeXml(opts.body)}</body>`,
      `</message>`,
    ].join('')
    this.send(stanza)
    this.stats.messagesOut++
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.socket?.destroy()
    this.socket = null
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const xmppBridge = new XmppBridge()
