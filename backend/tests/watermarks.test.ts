import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient, createUser } from './client'

describe('Watermarks & Sequential IDs', () => {
  let client: ApiClient
  let roomId: string

  beforeAll(async () => {
    const u = await createUser('wm')
    client = u.client
    const room = await client.post('/rooms', { name: `wmroom_${Date.now()}` })
    roomId = room.data.id
  })

  it('messages have monotonically increasing seq within a room', async () => {
    // Send sequentially — parallel sends race on seq assignment, which is fine
    // (the DB atomically guarantees uniqueness), but response order isn't guaranteed.
    const a = await client.post(`/rooms/${roomId}/messages`, { content: 'seq_a' })
    const b = await client.post(`/rooms/${roomId}/messages`, { content: 'seq_b' })
    const c = await client.post(`/rooms/${roomId}/messages`, { content: 'seq_c' })
    const seqs = [a, b, c].map(r => r.data.seq as number)
    expect(seqs.every(s => s > 0)).toBe(true)
    expect(new Set(seqs).size).toBe(3) // all unique
    expect(seqs[0]).toBeLessThan(seqs[1])
    expect(seqs[1]).toBeLessThan(seqs[2])
  })

  it('GET /seq returns current room watermark', async () => {
    await client.post(`/rooms/${roomId}/messages`, { content: 'check_seq' })
    const r = await client.get(`/rooms/${roomId}/messages/seq`)
    expect(r.status).toBe(200)
    expect(r.data.seq).toBeGreaterThan(0)
  })

  it('POST /watermark stores user read position', async () => {
    const msg = await client.post(`/rooms/${roomId}/messages`, { content: 'mark_me' })
    const seq = msg.data.seq
    const r = await client.post(`/rooms/${roomId}/messages/watermark`, { seq })
    expect(r.status).toBe(200)
  })

  it('afterSeq returns only newer messages', async () => {
    const a = await client.post(`/rooms/${roomId}/messages`, { content: 'after_a' })
    await client.post(`/rooms/${roomId}/messages`, { content: 'after_b' })
    await client.post(`/rooms/${roomId}/messages`, { content: 'after_c' })

    const pivotSeq = a.data.seq as number
    const r = await client.get(`/rooms/${roomId}/messages?afterSeq=${pivotSeq}`)
    expect(r.status).toBe(200)
    expect(r.data.every((m: any) => m.seq > pivotSeq)).toBe(true)
    expect(r.data.some((m: any) => m.content === 'after_b')).toBe(true)
    expect(r.data.some((m: any) => m.content === 'after_c')).toBe(true)
    expect(r.data.some((m: any) => m.content === 'after_a')).toBe(false)
  })

  it('beforeSeq returns only older messages', async () => {
    const x = await client.post(`/rooms/${roomId}/messages`, { content: 'before_x' })
    const y = await client.post(`/rooms/${roomId}/messages`, { content: 'before_y' })
    const z = await client.post(`/rooms/${roomId}/messages`, { content: 'before_z' })

    const pivotSeq = z.data.seq as number
    const r = await client.get(`/rooms/${roomId}/messages?beforeSeq=${pivotSeq}`)
    expect(r.status).toBe(200)
    expect(r.data.every((m: any) => m.seq < pivotSeq)).toBe(true)
    expect(r.data.some((m: any) => m.content === 'before_x')).toBe(true)
    expect(r.data.some((m: any) => m.content === 'before_y')).toBe(true)
    expect(r.data.some((m: any) => m.content === 'before_z')).toBe(false)
  })

  it('afterSeq returns messages in ascending order', async () => {
    const first = await client.post(`/rooms/${roomId}/messages`, { content: 'ord_start' })
    await client.post(`/rooms/${roomId}/messages`, { content: 'ord_1' })
    await client.post(`/rooms/${roomId}/messages`, { content: 'ord_2' })

    const r = await client.get(`/rooms/${roomId}/messages?afterSeq=${first.data.seq}`)
    const seqs = r.data.map((m: any) => m.seq as number)
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1])
    }
  })
})

describe('Large History Pagination', () => {
  it('can paginate through 150 messages using beforeSeq cursor', async () => {
    const { client } = await createUser('largehist')
    const room = await client.post('/rooms', { name: `large_${Date.now()}` })
    const roomId = room.data.id

    // Send 150 messages sequentially (batched in groups of 10 to stay fast)
    const TOTAL = 150
    for (let batch = 0; batch < TOTAL / 10; batch++) {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          client.post(`/rooms/${roomId}/messages`, { content: `msg_${batch * 10 + i}` })
        )
      )
    }

    // Verify total count via seq endpoint
    const seqR = await client.get(`/rooms/${roomId}/messages/seq`)
    expect(seqR.data.seq).toBeGreaterThanOrEqual(TOTAL)

    // Paginate from latest, walking backwards with beforeSeq
    let fetched: any[] = []
    let cursor: number | undefined = undefined
    let pages = 0

    do {
      const url = cursor !== undefined
        ? `/rooms/${roomId}/messages?beforeSeq=${cursor}&limit=50`
        : `/rooms/${roomId}/messages?limit=50`
      const r = await client.get(url)
      expect(r.status).toBe(200)

      if (r.data.length === 0) break
      fetched = [...r.data, ...fetched]
      cursor = r.data[0].seq as number
      pages++
    } while (fetched.length < TOTAL && pages < 10)

    expect(fetched.length).toBeGreaterThanOrEqual(TOTAL)

    // All seqs are unique
    const seqs = fetched.map((m: any) => m.seq as number)
    expect(new Set(seqs).size).toBe(seqs.length)

    // Seqs are monotonically increasing across the full set
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1])
    }
  }, 30_000) // 30s timeout for 150 messages
})
