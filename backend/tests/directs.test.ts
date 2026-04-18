import { describe, it, expect } from 'vitest'
import { createUser } from './client'

async function makeFriends(userA: Awaited<ReturnType<typeof createUser>>, userB: Awaited<ReturnType<typeof createUser>>) {
  await userA.client.post('/friends/requests', { username: userB.user.username })
  const pending = await userB.client.get('/friends/requests')
  const req = pending.data.received.find((r: any) => r.requester.id === userA.user.id)
  await userB.client.post(`/friends/requests/${req.id}/accept`)
}

describe('Direct Messages', () => {
  it('friends can open a DM', async () => {
    const a = await createUser('dm_a')
    const b = await createUser('dm_b')
    await makeFriends(a, b)

    const r = await a.client.post('/directs/open', { userId: b.user.id })
    expect(r.status).toBe(201)
    expect(r.data.type).toBe('DIRECT')
  })

  it('opening DM twice returns the same room', async () => {
    const a = await createUser('dm_idem_a')
    const b = await createUser('dm_idem_b')
    await makeFriends(a, b)

    const r1 = await a.client.post('/directs/open', { userId: b.user.id })
    const r2 = await a.client.post('/directs/open', { userId: b.user.id })
    expect(r1.data.id).toBe(r2.data.id)
  })

  it('can send messages in a DM', async () => {
    const a = await createUser('dm_msg_a')
    const b = await createUser('dm_msg_b')
    await makeFriends(a, b)

    const dm = await a.client.post('/directs/open', { userId: b.user.id })
    const roomId = dm.data.id

    const msg = await a.client.post(`/rooms/${roomId}/messages`, { content: 'hey there!' })
    expect(msg.status).toBe(201)
    expect(msg.data.content).toBe('hey there!')

    const history = await b.client.get(`/rooms/${roomId}/messages`)
    expect(history.data.some((m: any) => m.content === 'hey there!')).toBe(true)
  })

  it('non-friends cannot open DM', async () => {
    const a = await createUser('dm_nonfriend_a')
    const b = await createUser('dm_nonfriend_b')

    const r = await a.client.post('/directs/open', { userId: b.user.id })
    expect(r.status).toBe(403)
  })

  it('cannot open DM with yourself', async () => {
    const a = await createUser('dm_self')
    const r = await a.client.post('/directs/open', { userId: a.user.id })
    expect(r.status).toBe(400)
  })
})
