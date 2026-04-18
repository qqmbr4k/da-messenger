import { describe, it, expect } from 'vitest'
import { createUser } from './client'

describe('Rooms', () => {
  it('creates a public room', async () => {
    const { client } = await createUser('rooms_create')
    const r = await client.post('/rooms', { name: `room_${Date.now()}`, description: 'Test room' })
    expect(r.status).toBe(201)
    expect(r.data).toMatchObject({ type: 'PUBLIC' })
    expect(r.data.ownerId).toBeDefined()
  })

  it('rejects duplicate room name', async () => {
    const { client } = await createUser('rooms_dup')
    const name = `duproom_${Date.now()}`
    await client.post('/rooms', { name })
    const r2 = await client.post('/rooms', { name })
    expect(r2.status).toBe(409)
  })

  it('lists public rooms in catalog', async () => {
    const { client } = await createUser('rooms_list')
    const name = `catalog_${Date.now()}`
    await client.post('/rooms', { name })
    const r = await client.get('/rooms')
    expect(r.status).toBe(200)
    expect(r.data.some((rm: any) => rm.name === name)).toBe(true)
  })

  it('searches room catalog', async () => {
    const { client } = await createUser('rooms_search')
    const unique = `srch_${Date.now()}`
    await client.post('/rooms', { name: unique })
    const r = await client.get(`/rooms?search=${unique}`)
    expect(r.status).toBe(200)
    expect(r.data.length).toBe(1)
    expect(r.data[0].name).toBe(unique)
  })

  it('lists my rooms', async () => {
    const { client } = await createUser('rooms_my')
    const name = `myroom_${Date.now()}`
    await client.post('/rooms', { name })
    const r = await client.get('/rooms/my')
    expect(r.status).toBe(200)
    expect(r.data.some((rm: any) => rm.name === name)).toBe(true)
  })

  it('another user joins a public room', async () => {
    const { client: owner } = await createUser('rooms_owner')
    const { client: joiner } = await createUser('rooms_joiner')
    const name = `joinable_${Date.now()}`
    const created = await owner.post('/rooms', { name })
    const roomId = created.data.id

    const join = await joiner.post(`/rooms/${roomId}/join`)
    expect(join.status).toBe(200)

    const mine = await joiner.get('/rooms/my')
    expect(mine.data.some((rm: any) => rm.id === roomId)).toBe(true)
  })

  it('user can leave a room', async () => {
    const { client: owner } = await createUser('rooms_leaveowner')
    const { client: member } = await createUser('rooms_leavemember')
    const name = `leaveme_${Date.now()}`
    const created = await owner.post('/rooms', { name })
    const roomId = created.data.id

    await member.post(`/rooms/${roomId}/join`)
    const leave = await member.post(`/rooms/${roomId}/leave`)
    expect(leave.status).toBe(200)
  })

  it('owner cannot leave their room', async () => {
    const { client } = await createUser('rooms_noleave')
    const created = await client.post('/rooms', { name: `noleave_${Date.now()}` })
    const r = await client.post(`/rooms/${created.data.id}/leave`)
    expect(r.status).toBe(400)
  })

  it('owner can update room settings', async () => {
    const { client } = await createUser('rooms_update')
    const created = await client.post('/rooms', { name: `updatable_${Date.now()}` })
    const r = await client.put(`/rooms/${created.data.id}`, { description: 'Updated!' })
    expect(r.status).toBe(200)
    expect(r.data.description).toBe('Updated!')
  })

  it('non-owner cannot update room', async () => {
    const { client: owner } = await createUser('rooms_updateowner')
    const { client: other } = await createUser('rooms_updateother')
    const created = await owner.post('/rooms', { name: `locked_${Date.now()}` })
    const roomId = created.data.id
    await other.post(`/rooms/${roomId}/join`)
    const r = await other.put(`/rooms/${roomId}`, { description: 'Hacked!' })
    expect(r.status).toBe(403)
  })

  it('owner can delete room', async () => {
    const { client } = await createUser('rooms_delete')
    const created = await client.post('/rooms', { name: `deleteme_${Date.now()}` })
    const r = await client.delete(`/rooms/${created.data.id}`)
    expect(r.status).toBe(200)
  })

  it('admin can ban and unban a member', async () => {
    const { client: owner } = await createUser('rooms_banowner')
    const { client: member, user: memberUser } = await createUser('rooms_banmember')
    const created = await owner.post('/rooms', { name: `banroom_${Date.now()}` })
    const roomId = created.data.id

    await member.post(`/rooms/${roomId}/join`)

    const ban = await owner.post(`/rooms/${roomId}/bans`, { userId: memberUser.id })
    expect(ban.status).toBe(200)

    const bans = await owner.get(`/rooms/${roomId}/bans`)
    expect(bans.data.some((b: any) => b.userId === memberUser.id)).toBe(true)

    const unban = await owner.delete(`/rooms/${roomId}/bans/${memberUser.id}`)
    expect(unban.status).toBe(200)
  })

  it('banned user cannot rejoin', async () => {
    const { client: owner } = await createUser('rooms_rejoinowner')
    const { client: member, user: memberUser } = await createUser('rooms_rejoinmember')
    const created = await owner.post('/rooms', { name: `norejoin_${Date.now()}` })
    const roomId = created.data.id

    await member.post(`/rooms/${roomId}/join`)
    await owner.post(`/rooms/${roomId}/bans`, { userId: memberUser.id })

    const rejoin = await member.post(`/rooms/${roomId}/join`)
    expect(rejoin.status).toBe(403)
  })

  it('owner can make and remove admins', async () => {
    const { client: owner } = await createUser('rooms_adminowner')
    const { client: member, user: memberUser } = await createUser('rooms_adminmember')
    const created = await owner.post('/rooms', { name: `adminroom_${Date.now()}` })
    const roomId = created.data.id

    await member.post(`/rooms/${roomId}/join`)

    const makeAdmin = await owner.post(`/rooms/${roomId}/admins`, { userId: memberUser.id })
    expect(makeAdmin.status).toBe(200)

    const removeAdmin = await owner.delete(`/rooms/${roomId}/admins/${memberUser.id}`)
    expect(removeAdmin.status).toBe(200)
  })

  it('private room invite flow', async () => {
    const { client: owner, user: ownerUser } = await createUser('rooms_inviteowner')
    const { client: invited } = await createUser('rooms_inviteduser')
    const created = await owner.post('/rooms', { name: `private_${Date.now()}`, type: 'PRIVATE' })
    const roomId = created.data.id

    // Get invited user's username via search
    const invitedMe = await invited.get('/auth/me')
    const invite = await owner.post(`/rooms/${roomId}/invitations`, { username: invitedMe.data.username })
    expect(invite.status).toBe(200)

    const pending = await invited.get('/rooms/invitations/pending')
    expect(pending.data.some((i: any) => i.roomId === roomId)).toBe(true)

    const accept = await invited.post(`/rooms/${roomId}/invitations/accept`)
    expect(accept.status).toBe(200)

    const mine = await invited.get('/rooms/my')
    expect(mine.data.some((rm: any) => rm.id === roomId)).toBe(true)
  })
})
