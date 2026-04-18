/**
 * Federation load test: 50 XMPP clients on server A + 50 on server B
 * messaging each other across the S2S federation link.
 *
 * Requires: docker compose --profile federation up -d ejabberd-b
 * Skipped automatically when ejabberd-b is not reachable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import net from 'net'
import { XmppTestClient, ejabberdRegisterUser } from './xmpp-client'

const SERVER_A = { c2sHost: 'localhost', c2sPort: 5222, apiBase: 'http://localhost:5280', domain: 'xmpp.localhost' }
const SERVER_B = { c2sHost: 'localhost', c2sPort: 5223, apiBase: 'http://localhost:5281', domain: 'xmpp-b.localhost' }
const CLIENT_COUNT = 50
const PASSWORD = 'FedTest1!'

function canConnect(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(timeoutMs)
    s.connect(port, host, () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

async function registerBatch(apiBase: string, domain: string, prefix: string, count: number) {
  const users = Array.from({ length: count }, (_, i) => ({
    username: `${prefix}_${i}`,
    password: PASSWORD,
  }))
  await Promise.all(users.map(u => ejabberdRegisterUser(apiBase, u.username, u.password, domain)))
  return users
}

async function connectBatch(
  users: { username: string; password: string }[],
  server: typeof SERVER_A,
): Promise<XmppTestClient[]> {
  const clients = users.map(u =>
    new XmppTestClient(server.c2sHost, server.c2sPort, u.username, PASSWORD, server.domain)
  )
  await Promise.all(clients.map(c => c.connect()))
  return clients
}

describe('Federation Load Test — 50 clients per server, A↔B messaging', () => {
  let clientsA: XmppTestClient[] = []
  let clientsB: XmppTestClient[] = []
  let usersA: { username: string; password: string }[] = []
  let usersB: { username: string; password: string }[] = []
  let federationAvailable = false

  const RUN_ID = Date.now()

  beforeAll(async () => {
    const [aOk, bOk] = await Promise.all([
      canConnect(SERVER_A.c2sHost, SERVER_A.c2sPort),
      canConnect(SERVER_B.c2sHost, SERVER_B.c2sPort),
    ])
    federationAvailable = aOk && bOk
    if (!federationAvailable) return

    // Register users on both servers in parallel
    const prefix = `fed_${RUN_ID}`
    ;[usersA, usersB] = await Promise.all([
      registerBatch(SERVER_A.apiBase, SERVER_A.domain, `a_${prefix}`, CLIENT_COUNT),
      registerBatch(SERVER_B.apiBase, SERVER_B.domain, `b_${prefix}`, CLIENT_COUNT),
    ])

    // Connect all clients in parallel
    ;[clientsA, clientsB] = await Promise.all([
      connectBatch(usersA, SERVER_A),
      connectBatch(usersB, SERVER_B),
    ])

    // Pre-warm S2S federation: send one message each direction and wait for delivery.
    // This establishes the TCP+dialback handshake between the two servers so the
    // actual load tests don't all time out waiting for first S2S connection.
    clientsA[0].sendMessage(clientsB[0].jid, '__warmup_A_to_B__')
    clientsB[0].sendMessage(clientsA[0].jid, '__warmup_B_to_A__')
    await Promise.all([
      clientsA[0].waitForMessages(1, 40_000),
      clientsB[0].waitForMessages(1, 40_000),
    ])
    // Reset so warmup messages don't pollute assertions
    clientsA.forEach(c => { c.messagesReceived = [] })
    clientsB.forEach(c => { c.messagesReceived = [] })
  }, 120_000)

  afterAll(async () => {
    ;[...clientsA, ...clientsB].forEach(c => c.disconnect())
  })

  it('skips gracefully when ejabberd-b is not running', () => {
    if (federationAvailable) return // test below covers the real scenario
    expect(true).toBe(true) // federation profile not active — expected in CI
  })

  it(`connects ${CLIENT_COUNT} clients to server A (xmpp.localhost)`, () => {
    if (!federationAvailable) return
    expect(clientsA).toHaveLength(CLIENT_COUNT)
    expect(clientsA.every(c => c.jid.endsWith('@xmpp.localhost'))).toBe(true)
  })

  it(`connects ${CLIENT_COUNT} clients to server B (xmpp-b.localhost)`, () => {
    if (!federationAvailable) return
    expect(clientsB).toHaveLength(CLIENT_COUNT)
    expect(clientsB.every(c => c.jid.endsWith('@xmpp-b.localhost'))).toBe(true)
  })

  it('A→B: each client on A sends a message to paired client on B', async () => {
    if (!federationAvailable) return

    clientsA.forEach(c => { c.messagesReceived = [] })
    clientsB.forEach(c => { c.messagesReceived = [] })

    for (let i = 0; i < CLIENT_COUNT; i++) {
      clientsA[i].sendMessage(clientsB[i].jid, `hello_from_A_${i}`)
    }

    await Promise.all(clientsB.map(c => c.waitForMessages(1, 15_000)))
    for (let i = 0; i < CLIENT_COUNT; i++) {
      expect(clientsB[i].messagesReceived.some(m => m.body === `hello_from_A_${i}`)).toBe(true)
    }
  }, 25_000)

  it('B→A: each client on B sends a message back to paired client on A', async () => {
    if (!federationAvailable) return

    clientsA.forEach(c => { c.messagesReceived = [] })
    clientsB.forEach(c => { c.messagesReceived = [] })

    for (let i = 0; i < CLIENT_COUNT; i++) {
      clientsB[i].sendMessage(clientsA[i].jid, `hello_from_B_${i}`)
    }

    await Promise.all(clientsA.map(c => c.waitForMessages(1, 15_000)))
    for (let i = 0; i < CLIENT_COUNT; i++) {
      expect(clientsA[i].messagesReceived.some(m => m.body === `hello_from_B_${i}`)).toBe(true)
    }
  }, 25_000)

  it('A↔B: all 50 pairs exchange messages simultaneously', async () => {
    if (!federationAvailable) return

    clientsA.forEach(c => { c.messagesReceived = [] })
    clientsB.forEach(c => { c.messagesReceived = [] })

    // Fire both directions at the same time
    for (let i = 0; i < CLIENT_COUNT; i++) {
      clientsA[i].sendMessage(clientsB[i].jid, `ping_A${i}`)
      clientsB[i].sendMessage(clientsA[i].jid, `pong_B${i}`)
    }

    await Promise.all([
      ...clientsA.map(c => c.waitForMessages(1, 20_000)),
      ...clientsB.map(c => c.waitForMessages(1, 20_000)),
    ])

    const totalDeliveredToB = clientsB.reduce((sum, c) => sum + c.messagesReceived.length, 0)
    const totalDeliveredToA = clientsA.reduce((sum, c) => sum + c.messagesReceived.length, 0)

    expect(totalDeliveredToB).toBeGreaterThanOrEqual(CLIENT_COUNT)
    expect(totalDeliveredToA).toBeGreaterThanOrEqual(CLIENT_COUNT)
  }, 45_000)

  it('reports federation throughput', async () => {
    if (!federationAvailable) return

    const totalA = clientsA.reduce((sum, c) => sum + c.messagesReceived.length, 0)
    const totalB = clientsB.reduce((sum, c) => sum + c.messagesReceived.length, 0)

    // Verify S2S sessions opened in ejabberd stats
    const r = await fetch(`${SERVER_A.apiBase}/api/outgoing_s2s_number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const s2sCount = r.ok ? await r.json() : 0

    expect(totalA + totalB).toBeGreaterThanOrEqual(CLIENT_COUNT * 2)
    expect(s2sCount).toBeGreaterThanOrEqual(1) // at least one S2S session was opened

    console.log(`Federation stats: ${totalB} msgs delivered to B, ${totalA} to A, ${s2sCount} S2S sessions`)
  }, 15_000)
})

describe('Single-server load — 50 clients on A chatting with each other', () => {
  let clients: XmppTestClient[] = []
  let serverAAvailable = false
  const RUN_ID = Date.now()

  beforeAll(async () => {
    serverAAvailable = await canConnect(SERVER_A.c2sHost, SERVER_A.c2sPort)
    if (!serverAAvailable) return

    const users = await registerBatch(
      SERVER_A.apiBase, SERVER_A.domain, `solo_${RUN_ID}`, CLIENT_COUNT
    )
    clients = await connectBatch(users, SERVER_A)
  }, 60_000)

  afterAll(() => clients.forEach(c => c.disconnect()))

  it(`${CLIENT_COUNT} clients connect successfully to server A`, () => {
    if (!serverAAvailable) return
    expect(clients).toHaveLength(CLIENT_COUNT)
  })

  it('all clients exchange messages within the same server', async () => {
    if (!serverAAvailable) return

    // Each client sends to the next (ring): client[i] → client[(i+1)%N]
    for (let i = 0; i < CLIENT_COUNT; i++) {
      const target = clients[(i + 1) % CLIENT_COUNT]
      clients[i].sendMessage(target.jid, `ring_${i}`)
    }

    await Promise.all(clients.map(c => c.waitForMessages(1, 20_000)))

    const totalReceived = clients.reduce((sum, c) => sum + c.messagesReceived.length, 0)
    expect(totalReceived).toBeGreaterThanOrEqual(CLIENT_COUNT)
  }, 35_000)
})
