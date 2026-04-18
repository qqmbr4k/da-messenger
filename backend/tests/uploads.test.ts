import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient, createUser } from './client'

const BASE = process.env.API_URL ?? 'http://localhost:4000/api'

async function uploadFile(client: ApiClient, roomId: string, messageId: string, content: string, filename: string, mime: string) {
  const me = await client.get('/auth/me')
  const cookieStr = (client as any).cookieHeader?.() ?? ''
  // Use native FormData + fetch since our client only does JSON
  const form = new FormData()
  const blob = new Blob([content], { type: mime })
  form.append('file', blob, filename)
  form.append('messageId', messageId)

  const res = await fetch(`${BASE}/rooms/${roomId}/files`, {
    method: 'POST',
    headers: { Cookie: cookieStr },
    body: form,
  })
  return { status: res.status, data: res.ok ? await res.json() : await res.json() }
}

// Expose cookie header for upload helper
class TestClient extends ApiClient {
  getCookieHeader() { return (this as any).cookieHeader() as string }
}

async function createTestUser(suffix: string) {
  const ts = Date.now()
  const email = `${suffix}_${ts}@test.local`
  const username = `${suffix}_${ts}`
  const password = 'Test1234!'
  const client = new TestClient()
  await client.post('/auth/register', { email, username, password })
  const login = await client.post('/auth/login', { email, password })
  return { client, user: login.data as { id: string; username: string } }
}

describe('Uploads', () => {
  let ownerClient: TestClient
  let outsiderClient: TestClient
  let roomId: string

  beforeAll(async () => {
    const owner = await createTestUser('up_owner')
    const outsider = await createTestUser('up_outsider')
    ownerClient = owner.client
    outsiderClient = outsider.client

    const room = await owner.client.post('/rooms', { name: `uploadroom_${Date.now()}` })
    roomId = room.data.id
  })

  it('member can upload a file to a message', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'with attachment' })
    const messageId = msg.data.id

    const form = new FormData()
    form.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'hello.txt')
    form.append('messageId', messageId)

    const res = await fetch(`${BASE}/rooms/${roomId}/files`, {
      method: 'POST',
      headers: { Cookie: ownerClient.getCookieHeader() },
      body: form,
    })
    expect(res.status).toBe(201)
    const att = await res.json()
    expect(att.originalName).toBe('hello.txt')
    expect(att.id).toBeDefined()
  })

  it('member can download a file', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'downloadable' })
    const form = new FormData()
    form.append('file', new Blob(['download me'], { type: 'text/plain' }), 'dl.txt')
    form.append('messageId', msg.data.id)

    const upload = await fetch(`${BASE}/rooms/${roomId}/files`, {
      method: 'POST',
      headers: { Cookie: ownerClient.getCookieHeader() },
      body: form,
    })
    const att = await upload.json()

    const dl = await fetch(`${BASE}/rooms/${roomId}/files/${att.id}`, {
      headers: { Cookie: ownerClient.getCookieHeader() },
    })
    expect(dl.status).toBe(200)
    const text = await dl.text()
    expect(text).toBe('download me')
  })

  it('non-member cannot download', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'secret file' })
    const form = new FormData()
    form.append('file', new Blob(['secret'], { type: 'text/plain' }), 'secret.txt')
    form.append('messageId', msg.data.id)

    const upload = await fetch(`${BASE}/rooms/${roomId}/files`, {
      method: 'POST',
      headers: { Cookie: ownerClient.getCookieHeader() },
      body: form,
    })
    const att = await upload.json()

    const dl = await fetch(`${BASE}/rooms/${roomId}/files/${att.id}`, {
      headers: { Cookie: outsiderClient.getCookieHeader() },
    })
    expect(dl.status).toBe(403)
  })

  it('rejects file exceeding size limit', async () => {
    const msg = await ownerClient.post(`/rooms/${roomId}/messages`, { content: 'big file' })
    // Create a blob slightly over 3MB (image limit)
    const big = new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'image/png' })
    const form = new FormData()
    form.append('file', big, 'big.png')
    form.append('messageId', msg.data.id)

    const res = await fetch(`${BASE}/rooms/${roomId}/files`, {
      method: 'POST',
      headers: { Cookie: ownerClient.getCookieHeader() },
      body: form,
    })
    expect(res.status).toBe(413)
  })
})
