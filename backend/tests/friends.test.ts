import { describe, it, expect } from 'vitest'
import { createUser } from './client'

describe('Friends', () => {
  it('sends and accepts a friend request', async () => {
    const { client: a } = await createUser('fr_sender')
    const { client: b, user: userB } = await createUser('fr_receiver')

    const req = await a.post('/friends/requests', { username: userB.username, message: 'hey!' })
    expect(req.status).toBe(201)

    const pending = await b.get('/friends/requests')
    expect(pending.data.received.length).toBeGreaterThanOrEqual(1)
    const reqId = pending.data.received[0].id

    const accept = await b.post(`/friends/requests/${reqId}/accept`)
    expect(accept.status).toBe(200)

    const friendsA = await a.get('/friends')
    expect(friendsA.data.some((f: any) => f.id === userB.id)).toBe(true)
  })

  it('declines a friend request', async () => {
    const { client: a } = await createUser('fr_dec_a')
    const { client: b, user: userB } = await createUser('fr_dec_b')

    await a.post('/friends/requests', { username: userB.username })
    const pending = await b.get('/friends/requests')
    const reqId = pending.data.received[0].id

    const r = await b.post(`/friends/requests/${reqId}/decline`)
    expect(r.status).toBe(200)

    const friends = await a.get('/friends')
    expect(friends.data.some((f: any) => f.id === userB.id)).toBe(false)
  })

  it('removes a friend', async () => {
    const { client: a, user: userA } = await createUser('fr_rem_a')
    const { client: b, user: userB } = await createUser('fr_rem_b')

    await a.post('/friends/requests', { username: userB.username })
    const pending = await b.get('/friends/requests')
    await b.post(`/friends/requests/${pending.data.received[0].id}/accept`)

    const remove = await a.delete(`/friends/${userB.id}`)
    expect(remove.status).toBe(200)

    const friends = await b.get('/friends')
    expect(friends.data.some((f: any) => f.id === userA.id)).toBe(false)
  })

  it('cannot send request to yourself', async () => {
    const { client: a, user: userA } = await createUser('fr_self')
    const r = await a.post('/friends/requests', { username: userA.username })
    expect(r.status).toBe(400)
  })

  it('cannot send duplicate request', async () => {
    const { client: a } = await createUser('fr_dup_a')
    const { user: userB } = await createUser('fr_dup_b')

    await a.post('/friends/requests', { username: userB.username })
    const r2 = await a.post('/friends/requests', { username: userB.username })
    expect(r2.status).toBe(409)
  })

  it('user ban blocks messaging and terminates friendship', async () => {
    const { client: a, user: userA } = await createUser('ban_a')
    const { client: b, user: userB } = await createUser('ban_b')

    // Become friends first
    await a.post('/friends/requests', { username: userB.username })
    const pending = await b.get('/friends/requests')
    await b.post(`/friends/requests/${pending.data.received[0].id}/accept`)

    // A bans B
    const ban = await a.post('/friends/bans', { userId: userB.id })
    expect(ban.status).toBe(200)

    // No longer friends
    const friends = await a.get('/friends')
    expect(friends.data.some((f: any) => f.id === userB.id)).toBe(false)

    // B cannot open DM with A
    const dm = await b.post('/directs/open', { userId: userA.id })
    expect(dm.status).toBe(403)
  })

  it('unbans a user', async () => {
    const { client: a } = await createUser('unban_a')
    const { user: userB } = await createUser('unban_b')

    await a.post('/friends/bans', { userId: userB.id })
    const unban = await a.delete(`/friends/bans/${userB.id}`)
    expect(unban.status).toBe(200)

    const bans = await a.get('/friends/bans')
    expect(bans.data.some((b: any) => b.bannedId === userB.id)).toBe(false)
  })

  it('cannot request friend from banned user', async () => {
    const { client: a } = await createUser('fr_ban_block_a')
    const { client: b, user: userB } = await createUser('fr_ban_block_b')

    await a.post('/friends/bans', { userId: userB.id })
    const r = await b.post('/friends/requests', { username: (await a.get('/auth/me')).data.username })
    expect(r.status).toBe(403)
  })
})
