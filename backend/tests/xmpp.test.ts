import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient, createUser } from './client'

describe('XMPP Auth Endpoints (ejabberd HTTP auth delegation)', () => {
  let username: string
  const password = 'Test1234!'

  beforeAll(async () => {
    const { user } = await createUser('xmpp_auth')
    username = user.username
  })

  it('check_password: valid credentials return true', async () => {
    const client = new ApiClient()
    const r = await client.get(`/xmpp/auth/check?user=${username}&password=${encodeURIComponent(password)}`)
    expect(r.status).toBe(200)
    expect(r.data.result).toBe('true')
  })

  it('check_password: wrong password returns false', async () => {
    const client = new ApiClient()
    const r = await client.get(`/xmpp/auth/check?user=${username}&password=wrongpass`)
    expect(r.status).toBe(200)
    expect(r.data.result).toBe('false')
  })

  it('check_password: non-existent user returns false', async () => {
    const client = new ApiClient()
    const r = await client.get(`/xmpp/auth/check?user=nobody_ever_${Date.now()}&password=whatever`)
    expect(r.status).toBe(200)
    expect(r.data.result).toBe('false')
  })

  it('check_password: missing params returns 400', async () => {
    const client = new ApiClient()
    const r = await client.get('/xmpp/auth/check?user=someone')
    expect(r.status).toBe(400)
  })

  it('user_exists: known user returns true', async () => {
    const client = new ApiClient()
    const r = await client.get(`/xmpp/auth/exists?user=${username}`)
    expect(r.status).toBe(200)
    expect(r.data.result).toBe('true')
  })

  it('user_exists: unknown user returns false', async () => {
    const client = new ApiClient()
    const r = await client.get(`/xmpp/auth/exists?user=ghost_${Date.now()}`)
    expect(r.status).toBe(200)
    expect(r.data.result).toBe('false')
  })

  it('POST auth: valid credentials return true', async () => {
    const client = new ApiClient()
    const r = await client.post('/xmpp/auth', { user: username, host: 'xmpp.localhost', password })
    expect(r.status).toBe(200)
    expect(r.data.result).toBe(true)
  })

  it('POST auth: wrong password returns false', async () => {
    const client = new ApiClient()
    const r = await client.post('/xmpp/auth', { user: username, host: 'xmpp.localhost', password: 'bad' })
    expect(r.status).toBe(200)
    expect(r.data.result).toBe(false)
  })

  it('POST auth/register: existing user returns true', async () => {
    const client = new ApiClient()
    const r = await client.post('/xmpp/auth/register', { user: username, host: 'xmpp.localhost' })
    expect(r.status).toBe(200)
    expect(r.data.result).toBe(true)
  })

  it('POST auth/register: unknown user returns false', async () => {
    const client = new ApiClient()
    const r = await client.post('/xmpp/auth/register', { user: `ghost_${Date.now()}`, host: 'xmpp.localhost' })
    expect(r.status).toBe(200)
    expect(r.data.result).toBe(false)
  })
})

describe('XMPP Admin Stats API', () => {
  let client: ApiClient

  beforeAll(async () => {
    const u = await createUser('xmpp_admin')
    client = u.client
  })

  it('GET /xmpp/stats requires authentication', async () => {
    const anon = new ApiClient()
    const r = await anon.get('/xmpp/stats')
    expect(r.status).toBe(401)
  })

  it('GET /xmpp/stats returns bridge status', async () => {
    const r = await client.get('/xmpp/stats')
    expect(r.status).toBe(200)
    expect(r.data.bridge).toBeDefined()
    expect(typeof r.data.bridge.connected).toBe('boolean')
    expect(typeof r.data.bridge.domain).toBe('string')
    expect(typeof r.data.bridge.messagesIn).toBe('number')
    expect(typeof r.data.bridge.messagesOut).toBe('number')
    expect(typeof r.data.bridge.reconnectAttempts).toBe('number')
  })

  it('bridge is connected to ejabberd', async () => {
    const r = await client.get('/xmpp/stats')
    expect(r.data.bridge.connected).toBe(true)
    expect(r.data.bridge.connectedAt).not.toBeNull()
  })

  it('ejabberd stats include registered user count', async () => {
    const r = await client.get('/xmpp/stats')
    expect(r.data.ejabberd).not.toBeNull()
    expect(typeof r.data.ejabberd.registeredUsers).toBe('number')
    expect(r.data.ejabberd.registeredUsers).toBeGreaterThan(0)
  })

  it('GET /xmpp/sessions returns array', async () => {
    const r = await client.get('/xmpp/sessions')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data)).toBe(true)
  })

  it('GET /xmpp/federation returns bridge stats and s2s info', async () => {
    const r = await client.get('/xmpp/federation')
    expect(r.status).toBe(200)
    expect(r.data.bridgeStats).toBeDefined()
    expect(r.data.bridgeStats.connected).toBe(true)
    // s2sSessions may be 0 or a number (no federation peers in test env)
    expect(r.data.s2sSessions !== undefined).toBe(true)
  })

  it('GET /xmpp/sessions requires authentication', async () => {
    const anon = new ApiClient()
    const r = await anon.get('/xmpp/sessions')
    expect(r.status).toBe(401)
  })

  it('GET /xmpp/federation requires authentication', async () => {
    const anon = new ApiClient()
    const r = await anon.get('/xmpp/federation')
    expect(r.status).toBe(401)
  })
})

describe('XMPP User Sync — ejabberd account reflects web registrations', () => {
  it('registering a web user creates an XMPP account', async () => {
    const { user } = await createUser('xmpp_sync')
    // Immediately check via our auth endpoint — ejabberd should have the account
    const client = new ApiClient()
    const exists = await client.get(`/xmpp/auth/exists?user=${user.username}`)
    expect(exists.data.result).toBe('true')

    const check = await client.get(
      `/xmpp/auth/check?user=${user.username}&password=${encodeURIComponent('Test1234!')}`
    )
    expect(check.data.result).toBe('true')
  })

  it('ejabberd registered users count increases after registration', async () => {
    const statsBefore = await (await createUser('xmpp_count')).client.get('/xmpp/stats')
    const countBefore = statsBefore.data.ejabberd?.registeredUsers ?? 0

    await createUser('xmpp_count2')

    const { client } = await createUser('xmpp_count3')
    const statsAfter = await client.get('/xmpp/stats')
    const countAfter = statsAfter.data.ejabberd?.registeredUsers ?? 0

    expect(countAfter).toBeGreaterThan(countBefore)
  })
})

describe('Account Deletion — owned rooms are deleted', () => {
  it('deleting account removes owned rooms', async () => {
    const { client: owner, user: ownerUser } = await createUser('del_owner')
    const { client: member } = await createUser('del_member')

    // Create a room owned by owner
    const room = await owner.post('/rooms', { name: `delroom_${Date.now()}` })
    const roomId = room.data.id
    await member.post(`/rooms/${roomId}/join`)

    // Send a message to verify room exists
    const msg = await owner.post(`/rooms/${roomId}/messages`, { content: 'before deletion' })
    expect(msg.status).toBe(201)

    // Delete the owner's account
    const del = await owner.delete('/auth/account', { password: 'Test1234!' })
    expect(del.status).toBe(200)

    // Member should no longer be able to access the room
    const r = await member.get(`/rooms/${roomId}/messages`)
    expect(r.status).toBe(403)
  })

  it('deleting account removes only owned rooms, not joined rooms', async () => {
    const { client: owner } = await createUser('del_owner2')
    const { client: joiner } = await createUser('del_joiner')

    // Owner creates a room
    const room = await owner.post('/rooms', { name: `keeproom_${Date.now()}` })
    const roomId = room.data.id

    // Joiner joins the room
    await joiner.post(`/rooms/${roomId}/join`)

    // Joiner deletes their account (they don't own the room)
    const del = await joiner.delete('/auth/account', { password: 'Test1234!' })
    expect(del.status).toBe(200)

    // Owner's room should still exist
    const r = await owner.get(`/rooms/${roomId}`)
    expect(r.status).toBe(200)
    expect(r.data.id).toBe(roomId)
  })
})
