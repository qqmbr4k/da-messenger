import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient, createUser } from './client'

describe('Messages', () => {
  let ownerClient: ApiClient
  let memberClient: ApiClient
  let memberUser: { id: string; username: string }
  let roomId: string

  beforeAll(async () => {
    const owner = await createUser('msg_owner')
    const member = await createUser('msg_member')
    ownerClient = owner.client
    memberClient = member.client
    memberUser = member.user

    const created = await owner.client.post('/rooms', { name: `msgroom_${Date.now()}` })
    roomId = created.data.id
    await member.client.post(`/rooms/${roomId}/join`)
  })

  it('sends a message', async () => {
    const r = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'Hello world' })
    expect(r.status).toBe(201)
    expect(r.data.content).toBe('Hello world')
    expect(r.data.author).toBeDefined()
  })

  it('fetches message history', async () => {
    await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'msg_history_test' })
    const r = await ownerClient.get(`/rooms/${roomId}/messages`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data)).toBe(true)
    expect(r.data.some((m: any) => m.content === 'msg_history_test')).toBe(true)
  })

  it('paginates with beforeSeq cursor', async () => {
    await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'page_a' })
    await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'page_b' })
    const last = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'page_c' })

    const lastSeq = last.data.seq as number
    const older = await ownerClient.get(`/rooms/${roomId}/messages?beforeSeq=${lastSeq}&limit=2`)
    expect(older.status).toBe(200)
    expect(older.data.length).toBeLessThanOrEqual(2)
    expect(older.data.every((m: any) => m.seq < lastSeq)).toBe(true)
    expect(older.data.some((m: any) => m.content === 'page_c')).toBe(false)
  })

  it('sends a reply', async () => {
    const original = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'original' })
    const reply = await memberClient.post(`/rooms/${roomId}/messages`, {
      content: 'reply content',
      replyToId: original.data.id,
    })
    expect(reply.status).toBe(201)
    expect(reply.data.replyToId).toBe(original.data.id)
    expect(reply.data.replyTo.content).toBe('original')
  })

  it('author can edit their message', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'editable' })
    const r = await ownerClient.patch(`/rooms/${roomId}/messages/${msg.data.id}`, { content: 'edited!' })
    expect(r.status).toBe(200)
    expect(r.data.content).toBe('edited!')
    expect(r.data.editedAt).not.toBeNull()
  })

  it('non-author cannot edit', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'not yours' })
    const r = await memberClient.patch(`/rooms/${roomId}/messages/${msg.data.id}`, { content: 'hacked' })
    expect(r.status).toBe(403)
  })

  it('author can delete their message', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'deleteme' })
    const r = await ownerClient.delete(`/rooms/${roomId}/messages/${msg.data.id}`)
    expect(r.status).toBe(200)
    // Should no longer appear in history
    const history = await ownerClient.get(`/rooms/${roomId}/messages`)
    expect(history.data.some((m: any) => m.id === msg.data.id)).toBe(false)
  })

  it('admin can delete any message', async () => {
    const msg = await memberClient.post(`/rooms/${roomId}/messages`, { content: 'admin_delete_me' })
    // ownerClient is the admin (owner)
    const r = await ownerClient.delete(`/rooms/${roomId}/messages/${msg.data.id}`)
    expect(r.status).toBe(200)
  })

  it('non-member cannot read messages', async () => {
    const { client: outsider } = await createUser('msg_outsider')
    const r = await outsider.get(`/rooms/${roomId}/messages`)
    expect(r.status).toBe(403)
  })

  it('enforces max message length', async () => {
    const r = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'x'.repeat(3073) })
    expect(r.status).toBe(400)
  })
})
