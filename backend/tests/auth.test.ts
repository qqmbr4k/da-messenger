import { describe, it, expect } from 'vitest'
import { ApiClient, createUser } from './client'

describe('Auth', () => {
  it('registers a new user', async () => {
    const client = new ApiClient()
    const ts = Date.now()
    const r = await client.post('/auth/register', {
      email: `reg_${ts}@test.local`,
      username: `reg_${ts}`,
      password: 'Test1234!',
    })
    expect(r.status).toBe(201)
    expect(r.data).toMatchObject({ email: `reg_${ts}@test.local`, username: `reg_${ts}` })
    expect(r.data.password).toBeUndefined()
  })

  it('rejects duplicate email', async () => {
    const { user } = await createUser('dupemail')
    const client2 = new ApiClient()
    const r = await client2.post('/auth/register', {
      email: user.email,
      username: `other_${Date.now()}`,
      password: 'Test1234!',
    })
    expect(r.status).toBe(409)
    expect(r.data.error).toMatch(/email/i)
  })

  it('rejects duplicate username', async () => {
    const { user } = await createUser('dupname')
    const client2 = new ApiClient()
    const r = await client2.post('/auth/register', {
      email: `other_${Date.now()}@test.local`,
      username: user.username,
      password: 'Test1234!',
    })
    expect(r.status).toBe(409)
    expect(r.data.error).toMatch(/username/i)
  })

  it('logs in and returns user', async () => {
    const { client, user } = await createUser('login')
    const me = await client.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.data.id).toBe(user.id)
  })

  it('rejects wrong password', async () => {
    const client = new ApiClient()
    const ts = Date.now()
    await client.post('/auth/register', {
      email: `wrongpw_${ts}@test.local`,
      username: `wrongpw_${ts}`,
      password: 'Test1234!',
    })
    const r = await client.post('/auth/login', { email: `wrongpw_${ts}@test.local`, password: 'bad' })
    expect(r.status).toBe(401)
  })

  it('/me returns 401 when not logged in', async () => {
    const r = await new ApiClient().get('/auth/me')
    expect(r.status).toBe(401)
  })

  it('logout clears session', async () => {
    const { client } = await createUser('logout')
    const r = await client.post('/auth/logout')
    expect(r.status).toBe(200)
    const me = await client.get('/auth/me')
    expect(me.status).toBe(401)
  })

  it('lists active sessions', async () => {
    const { client } = await createUser('sessions')
    const r = await client.get('/auth/sessions')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.data)).toBe(true)
    expect(r.data.length).toBeGreaterThanOrEqual(1)
    const current = r.data.find((s: any) => s.isCurrent)
    expect(current).toBeDefined()
  })

  it('changes password', async () => {
    const { client, user } = await createUser('chpw')
    const r = await client.put('/auth/password', { currentPassword: 'Test1234!', newPassword: 'NewPass99!' })
    expect(r.status).toBe(200)
    // login with new password
    const client2 = new ApiClient()
    const r2 = await client2.post('/auth/login', { email: user.email, password: 'NewPass99!' })
    expect(r2.status).toBe(200)
  })

  it('rejects password change with wrong current password', async () => {
    const { client } = await createUser('chpwbad')
    const r = await client.put('/auth/password', { currentPassword: 'wrong', newPassword: 'NewPass99!' })
    expect(r.status).toBe(401)
  })

  it('password reset flow', async () => {
    const { user } = await createUser('pwreset')
    const client = new ApiClient()
    const forgot = await client.post('/auth/forgot-password', { email: user.email })
    expect(forgot.status).toBe(200)
    expect(forgot.data.resetToken).toBeDefined()

    const reset = await client.post('/auth/reset-password', {
      resetToken: forgot.data.resetToken,
      newPassword: 'Reseted99!',
    })
    expect(reset.status).toBe(200)

    const client2 = new ApiClient()
    const login = await client2.post('/auth/login', { email: user.email, password: 'Reseted99!' })
    expect(login.status).toBe(200)
  })

  it('deletes account', async () => {
    const { client, user } = await createUser('delacc')
    const r = await client.delete('/auth/account', { password: 'Test1234!' })
    expect(r.status).toBe(200)
    // login should fail
    const client2 = new ApiClient()
    const r2 = await client2.post('/auth/login', { email: user.email, password: 'Test1234!' })
    expect(r2.status).toBe(401)
  })
})
