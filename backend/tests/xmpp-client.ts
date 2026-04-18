/**
 * Minimal raw-TCP XMPP client for load testing.
 * SASL PLAIN over plain TCP (dev mode — TLS disabled).
 */

import net from 'net'
import { EventEmitter } from 'events'

export interface XmppMessage {
  from: string
  to: string
  body: string
}

type State = 'connecting' | 'stream1' | 'sasl' | 'stream2' | 'binding' | 'ready' | 'error'

export class XmppTestClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buf = ''
  private state: State = 'connecting'
  private boundJid = ''
  private msgCounter = 0
  public messagesReceived: XmppMessage[] = []

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string,
    private domain: string,
    private resource = 'loadtest',
  ) {
    super()
  }

  get jid() { return `${this.username}@${this.domain}` }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()
      this.socket.setEncoding('utf8')

      this.once('ready', resolve)
      this.once('error', reject)

      this.socket.on('error', err => {
        if (this.state !== 'ready') this.emit('error', err)
      })
      this.socket.on('close', () => this.emit('close'))
      this.socket.on('data', (chunk: string) => {
        this.buf += chunk
        this.pump()
      })

      this.socket.connect(this.port, this.host, () => {
        this.state = 'stream1'
        this.write(this.streamOpen())
      })
    })
  }

  private pump() {
    let again = true
    while (again) {
      again = false
      switch (this.state) {
        case 'stream1':
          if (this.buf.includes('<stream:features')) {
            const plain = Buffer.from(`\0${this.username}\0${this.password}`).toString('base64')
            this.write(`<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>${plain}</auth>`)
            this.state = 'sasl'
            this.buf = ''
            again = true
          }
          break

        case 'sasl':
          if (this.buf.includes('<success')) {
            this.buf = ''
            this.state = 'stream2'
            this.write(this.streamOpen())
            again = true
          } else if (this.buf.includes('<failure')) {
            this.state = 'error'
            this.emit('error', new Error(`SASL auth failed: ${this.username}@${this.domain}`))
          }
          break

        case 'stream2':
          if (this.buf.includes('<stream:features')) {
            this.state = 'binding'
            // Don't clear buffer here — bind response may arrive immediately
            this.write(
              `<iq type='set' id='bind1'>` +
              `<bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>` +
              `<resource>${this.resource}</resource>` +
              `</bind></iq>`
            )
            again = true
          }
          break

        case 'binding': {
          const jidMatch = this.buf.match(/<jid>([^<]+)<\/jid>/)
          if (jidMatch) {
            this.boundJid = jidMatch[1]
            this.state = 'ready'
            this.buf = this.buf.slice(this.buf.indexOf('</iq>') + 5) // drop bind IQ
            // Send initial presence so ejabberd routes messages to this session
            this.write('<presence/>')
            this.emit('ready')
            again = true
          } else if (this.buf.includes("type='error'") || this.buf.includes('type="error"')) {
            this.state = 'error'
            this.emit('error', new Error(`Resource bind failed: ${this.jid}`))
          }
          break
        }

        case 'ready':
          again = this.parseMessages()
          break
      }
    }
  }

  private parseMessages(): boolean {
    // Match complete <message> stanzas
    const re = /<message\b[^>]*>[\s\S]*?<\/message>/g
    let found = false
    let m: RegExpExecArray | null
    while ((m = re.exec(this.buf)) !== null) {
      found = true
      const stanza = m[0]
      const from = (stanza.match(/\bfrom=['"]([^'"]+)['"]/) || [])[1] ?? ''
      const to   = (stanza.match(/\bto=['"]([^'"]+)['"]/) || [])[1] ?? ''
      const body = (stanza.match(/<body>([^<]*)<\/body>/) || [])[1] ?? ''
      if (body) {
        const msg: XmppMessage = { from, to, body }
        this.messagesReceived.push(msg)
        this.emit('message', msg)
      }
    }
    if (found) {
      this.buf = this.buf.replace(/<message\b[^>]*>[\s\S]*?<\/message>/g, '')
    }
    return found
  }

  sendMessage(to: string, body: string): string {
    const id = `${this.username}_${this.msgCounter++}`
    this.write(
      `<message from='${this.boundJid}' to='${to}' type='chat' id='${id}'>` +
      `<body>${esc(body)}</body>` +
      `</message>`
    )
    return id
  }

  waitForMessages(count: number, timeoutMs = 15_000): Promise<XmppMessage[]> {
    return new Promise((resolve, reject) => {
      if (this.messagesReceived.length >= count) { resolve(this.messagesReceived); return }
      const timer = setTimeout(() => {
        this.off('message', check)
        reject(new Error(
          `Timeout: ${this.jid} waiting for ${count} msgs, got ${this.messagesReceived.length}`
        ))
      }, timeoutMs)
      const check = () => {
        if (this.messagesReceived.length >= count) {
          clearTimeout(timer)
          this.off('message', check)
          resolve(this.messagesReceived)
        }
      }
      this.on('message', check)
    })
  }

  disconnect() {
    try { this.socket?.write('</stream:stream>') } catch {}
    this.socket?.destroy()
  }

  private streamOpen() {
    return (
      `<?xml version='1.0'?>` +
      `<stream:stream xmlns='jabber:client' ` +
      `xmlns:stream='http://etherx.jabber.org/streams' ` +
      `to='${this.domain}' version='1.0'>`
    )
  }

  private write(xml: string) {
    this.socket?.write(xml, 'utf8')
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function ejabberdRegisterUser(
  apiBase: string,
  username: string,
  password: string,
  domain: string,
): Promise<void> {
  await fetch(`${apiBase}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: username, host: domain, password }),
    signal: AbortSignal.timeout(5000),
  })
}
