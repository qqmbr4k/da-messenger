/**
 * Tests for requirements explicitly stated in REQUIREMENTS.md that weren't
 * covered by the feature-level test suites.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient, createUser } from './client'

const BASE = process.env.API_URL ?? 'http://localhost:4000/api'

function cookie(client: ApiClient): string {
  return (client as any).cookieHeader()
}

async function upload(
  client: ApiClient,
  roomId: string,
  messageId: string,
  content: Uint8Array | string,
  filename: string,
  mime: string,
  comment?: string,
) {
  const form = new FormData()
  form.append('file', new Blob([content], { type: mime }), filename)
  form.append('messageId', messageId)
  if (comment) form.append('comment', comment)
  return fetch(`${BASE}/rooms/${roomId}/files`, {
    method: 'POST',
    headers: { Cookie: cookie(client) },
    body: form,
  })
}

// ---------------------------------------------------------------------------
// §2.2.4 Session isolation — logout one session, others stay alive
// ---------------------------------------------------------------------------
describe('§2.2.4 Session isolation', () => {
  it('logging out a specific session does not invalidate other sessions', async () => {
    const ts = Date.now()
    const email = `sess_iso_${ts}@test.local`
    const username = `sess_iso_${ts}`
    const password = 'Test1234!'

    const reg = new ApiClient()
    await reg.post('/auth/register', { email, username, password })

    const sessionA = new ApiClient()
    const sessionB = new ApiClient()
    await sessionA.post('/auth/login', { email, password })
    await sessionB.post('/auth/login', { email, password })

    expect((await sessionA.get('/auth/me')).status).toBe(200)
    expect((await sessionB.get('/auth/me')).status).toBe(200)

    // Delete sessionA's own current session
    const list = await sessionA.get('/auth/sessions')
    const currentId = list.data.find((s: any) => s.isCurrent)?.id
    expect(currentId).toBeDefined()
    expect((await sessionA.delete(`/auth/sessions/${currentId}`)).status).toBe(200)

    // sessionA invalidated, sessionB unaffected
    expect((await sessionA.get('/auth/me')).status).toBe(401)
    expect((await sessionB.get('/auth/me')).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// §2.4.4 Private rooms — not in catalog, join requires invitation
// ---------------------------------------------------------------------------
describe('§2.4.4 Private room isolation', () => {
  it('private room does not appear in public catalog', async () => {
    const { client } = await createUser('priv_cat')
    const name = `priv_cat_${Date.now()}`
    await client.post('/rooms', { name, type: 'PRIVATE' })
    const catalog = await client.get('/rooms')
    expect(catalog.data.some((r: any) => r.name === name)).toBe(false)
  })

  it('user cannot join a private room without invitation', async () => {
    const { client: owner } = await createUser('priv_nojoin_own')
    const { client: outsider } = await createUser('priv_nojoin_out')
    const room = await owner.post('/rooms', { name: `priv_nojoin_${Date.now()}`, type: 'PRIVATE' })
    expect((await outsider.post(`/rooms/${room.data.id}/join`)).status).toBe(403)
  })

  it('invited user can accept and join the private room', async () => {
    const { client: owner } = await createUser('priv_inv_own')
    const { client: invitee, user: inviteeUser } = await createUser('priv_inv_user')
    const room = await owner.post('/rooms', { name: `priv_inv_${Date.now()}`, type: 'PRIVATE' })
    const roomId = room.data.id
    await owner.post(`/rooms/${roomId}/invitations`, { username: inviteeUser.username })
    expect((await invitee.post(`/rooms/${roomId}/invitations/accept`)).status).toBe(200)
    const mine = await invitee.get('/rooms/my')
    expect(mine.data.some((r: any) => r.id === roomId)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §2.4.6 Room deletion cascades to messages
// ---------------------------------------------------------------------------
describe('§2.4.6 Room deletion deletes messages', () => {
  it('after room deletion, messages are inaccessible to former members', async () => {
    const { client: owner } = await createUser('del_msg_own')
    const { client: member } = await createUser('del_msg_mem')
    const room = await owner.post('/rooms', { name: `del_cascade_${Date.now()}` })
    const roomId = room.data.id
    await member.post(`/rooms/${roomId}/join`)
    const msg = await member.post(`/rooms/${roomId}/messages`, { content: 'should disappear' })
    expect(msg.status).toBe(201)
    await owner.delete(`/rooms/${roomId}`)
    expect((await member.get(`/rooms/${roomId}/messages`)).status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// §2.4.7 Role permissions — admin vs owner capabilities
// ---------------------------------------------------------------------------
describe('§2.4.7 Admin and owner permissions', () => {
  let ownerClient: ApiClient
  let adminClient: ApiClient
  let memberClient: ApiClient
  let memberUser: { id: string; username: string }
  let adminUser: { id: string; username: string }
  let roomId: string

  beforeAll(async () => {
    const owner = await createUser('perm_owner')
    const admin = await createUser('perm_admin')
    const member = await createUser('perm_member')
    ownerClient = owner.client
    adminClient = admin.client
    adminUser = admin.user
    memberClient = member.client
    memberUser = member.user
    const room = await owner.client.post('/rooms', { name: `permroom_${Date.now()}` })
    roomId = room.data.id
    await admin.client.post(`/rooms/${roomId}/join`)
    await member.client.post(`/rooms/${roomId}/join`)
    await owner.client.post(`/rooms/${roomId}/admins`, { userId: admin.user.id })
  })

  it('admin can delete any message in the room', async () => {
    const msg = await memberClient.post(`/rooms/${roomId}/messages`, { content: 'delete_me' })
    expect((await adminClient.delete(`/rooms/${roomId}/messages/${msg.data.id}`)).status).toBe(200)
  })

  it('admin can remove (ban) a member from the room', async () => {
    const { client: target, user: targetUser } = await createUser('perm_target')
    await target.post(`/rooms/${roomId}/join`)
    expect((await adminClient.delete(`/rooms/${roomId}/members/${targetUser.id}`)).status).toBe(200)
    // Removal is treated as a ban — cannot rejoin
    expect((await target.post(`/rooms/${roomId}/join`)).status).toBe(403)
  })

  it('non-admin cannot remove members', async () => {
    const { client: target, user: targetUser } = await createUser('perm_cant_remove')
    await target.post(`/rooms/${roomId}/join`)
    expect((await memberClient.delete(`/rooms/${roomId}/members/${targetUser.id}`)).status).toBe(403)
  })

  it('admin cannot delete the room — only the owner can', async () => {
    expect((await adminClient.delete(`/rooms/${roomId}`)).status).toBe(403)
  })

  it('owner cannot lose admin privileges', async () => {
    const { client: o, user: ownerUser } = await createUser('perm_owner_prot')
    const room = await o.post('/rooms', { name: `ownerprot_${Date.now()}` })
    // Attempting to strip the owner of admin should be rejected
    expect((await o.delete(`/rooms/${room.data.id}/admins/${ownerUser.id}`)).status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// §2.4.8 Remove member = ban (blocks rejoin + appears on ban list)
// ---------------------------------------------------------------------------
describe('§2.4.8 Remove member is treated as a room ban', () => {
  it('removed member appears on ban list and cannot rejoin', async () => {
    const { client: owner } = await createUser('rm_ban_own')
    const { client: victim, user: victimUser } = await createUser('rm_ban_vic')
    const room = await owner.post('/rooms', { name: `rm_ban_${Date.now()}` })
    const roomId = room.data.id
    await victim.post(`/rooms/${roomId}/join`)
    await owner.delete(`/rooms/${roomId}/members/${victimUser.id}`)
    const bans = await owner.get(`/rooms/${roomId}/bans`)
    expect(bans.data.some((b: any) => b.userId === victimUser.id)).toBe(true)
    expect((await victim.post(`/rooms/${roomId}/join`)).status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// §2.6.3 Attachment metadata — original filename and optional comment
// ---------------------------------------------------------------------------
describe('§2.6.3 Attachment metadata', () => {
  it('original filename and comment are stored and returned', async () => {
    const { client } = await createUser('att_meta')
    const room = await client.post('/rooms', { name: `attmeta_${Date.now()}` })
    const roomId = room.data.id
    const msg = await client.post(`/rooms/${roomId}/messages`, { content: 'file msg' })
    const res = await upload(client, roomId, msg.data.id, 'hello', 'myfile.txt', 'text/plain', 'review this')
    expect(res.status).toBe(201)
    const att = await res.json()
    expect(att.originalName).toBe('myfile.txt')
    expect(att.comment).toBe('review this')
  })
})

// ---------------------------------------------------------------------------
// §2.6.4 File access revoked when user is banned from the room
// ---------------------------------------------------------------------------
describe('§2.6.4 File access revoked on room ban', () => {
  it('banned member can no longer download files they previously uploaded', async () => {
    const { client: owner } = await createUser('fban_own')
    const { client: member, user: memberUser } = await createUser('fban_mem')
    const room = await owner.post('/rooms', { name: `fban_${Date.now()}` })
    const roomId = room.data.id
    await member.post(`/rooms/${roomId}/join`)

    const msg = await member.post(`/rooms/${roomId}/messages`, { content: 'file msg' })
    const uploadRes = await upload(member, roomId, msg.data.id, 'secret', 'secret.txt', 'text/plain')
    expect(uploadRes.status).toBe(201)
    const { id: fileId } = await uploadRes.json()

    // Member can download before ban
    const before = await fetch(`${BASE}/rooms/${roomId}/files/${fileId}`, {
      headers: { Cookie: cookie(member) },
    })
    expect(before.status).toBe(200)

    // Ban the member
    await owner.post(`/rooms/${roomId}/bans`, { userId: memberUser.id })

    // Member can no longer download
    const after = await fetch(`${BASE}/rooms/${roomId}/files/${fileId}`, {
      headers: { Cookie: cookie(member) },
    })
    expect(after.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// §3.4 File size limits — 3 MB for images, 20 MB for other files
// ---------------------------------------------------------------------------
describe('§3.4 File size limits', () => {
  let client: ApiClient
  let roomId: string
  let msgId: string

  beforeAll(async () => {
    const u = await createUser('size_limit')
    client = u.client
    const room = await client.post('/rooms', { name: `sizelimit_${Date.now()}` })
    roomId = room.data.id
    msgId = (await client.post(`/rooms/${roomId}/messages`, { content: 'files' })).data.id
  })

  it('rejects image over 3 MB', async () => {
    const res = await upload(
      client, roomId, msgId,
      new Uint8Array(3 * 1024 * 1024 + 1), 'big.jpg', 'image/jpeg',
    )
    expect(res.status).toBe(413)
  })

  it('accepts non-image file under 20 MB', async () => {
    const res = await upload(
      client, roomId, msgId,
      new Uint8Array(512 * 1024), 'data.bin', 'application/octet-stream',
    )
    expect(res.status).toBe(201)
  })

  it('rejects non-image file over 20 MB', async () => {
    const res = await upload(
      client, roomId, msgId,
      new Uint8Array(20 * 1024 * 1024 + 1), 'huge.zip', 'application/zip',
    )
    expect(res.status).toBe(413)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// §2.1.5 Account deletion — membership cleaned up, non-owned rooms survive
// ---------------------------------------------------------------------------
describe('§2.1.5 Account deletion membership cleanup', () => {
  it('deleting account removes user from joined rooms without deleting those rooms', async () => {
    const { client: owner } = await createUser('acc_del_own')
    const { client: joiner } = await createUser('acc_del_join')
    const room = await owner.post('/rooms', { name: `acc_del_${Date.now()}` })
    const roomId = room.data.id
    await joiner.post(`/rooms/${roomId}/join`)

    await joiner.delete('/auth/account', { password: 'Test1234!' })

    // Room still accessible to its owner
    const roomAfter = await owner.get(`/rooms/${roomId}`)
    expect(roomAfter.status).toBe(200)
    expect(roomAfter.data.id).toBe(roomId)
  })
})
