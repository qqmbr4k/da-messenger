import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'

/** Send a friend request from the Contacts page */
async function sendFriendRequest(page: import('@playwright/test').Page, toUsername: string) {
  await page.locator('a[href="/contacts"]').click()
  await page.locator('input[placeholder="Enter a username"]').fill(toUsername)
  await page.locator('button:has-text("Send Request")').click()
  await page.waitForTimeout(500)
}

/** Accept first pending friend request on the Contacts page */
async function acceptFirstRequest(page: import('@playwright/test').Page) {
  await page.locator('a[href="/contacts"]').click()
  await page.locator('button:has-text("Accept")').first().click()
  await page.waitForTimeout(500)
}

test.describe('2.3 Contacts / Friends', () => {
  test('send and accept friend request — both see each other in friends list', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `alice${id}@test.com`, `alice${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `bob${id}@test.com`, `bob${id}`)

    await sendFriendRequest(page, `bob${id}`)
    await acceptFirstRequest(page2)

    // Alice reloads contacts to see updated list
    await page.goto('/contacts')
    await expect(page.locator(`text=bob${id}`).first()).toBeVisible({ timeout: 8_000 })

    // Bob sees Alice
    await expect(page2.locator(`text=alice${id}`).first()).toBeVisible({ timeout: 8_000 })
    await ctx2.close()
  })

  test('remove friend', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `rmA${id}@test.com`, `rmA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `rmB${id}@test.com`, `rmB${id}`)
    await sendFriendRequest(page, `rmB${id}`)
    await acceptFirstRequest(page2)

    // Reload contacts to ensure friendship is visible
    await page.goto('/contacts')
    await expect(page.locator(`text=rmB${id}`).first()).toBeVisible({ timeout: 8_000 })

    // Alice removes Bob — hover to reveal Remove button
    await page.locator(`text=rmB${id}`).first().hover()
    await page.locator('button:has-text("Remove")').first().click()
    // Scope to main content only — sidebar may still list them as a DM contact
    await expect(page.getByRole('main').getByText(`rmB${id}`, { exact: true })).toBeHidden({ timeout: 8_000 })
    await ctx2.close()
  })

  test('open DM with friend — message is delivered', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `dmA${id}@test.com`, `dmA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `dmB${id}@test.com`, `dmB${id}`)
    await sendFriendRequest(page, `dmB${id}`)
    await acceptFirstRequest(page2)

    // Reload contacts to see updated friend list
    await page.goto('/contacts')
    await expect(page.locator(`text=dmB${id}`).first()).toBeVisible({ timeout: 8_000 })

    // Alice opens DM by hovering and clicking Message
    // Scope to main content to avoid matching sidebar "Direct Messages" button
    const mainArea = page.getByRole('main')
    await mainArea.locator(`text=dmB${id}`).first().hover()
    await mainArea.locator('button', { hasText: /^Message$/ }).first().click()
    // SPA navigation — wait for chat input rather than URL load event
    const input = page.locator('textarea[placeholder="Message..."]').first()
    await expect(input).toBeVisible({ timeout: 15_000 })

    // Send message
    await input.fill(`DM hello ${id}`)
    await input.press('Enter')
    await expect(page.locator(`text=DM hello ${id}`)).toBeVisible({ timeout: 6_000 })

    // Bob receives it — navigate to DM
    await page2.goto('/contacts')
    const main2 = page2.getByRole('main')
    await main2.locator(`text=dmA${id}`).first().hover()
    await main2.locator('button', { hasText: /^Message$/ }).first().click()
    await expect(page2.locator(`text=DM hello ${id}`)).toBeVisible({ timeout: 8_000 })
    await ctx2.close()
  })

  test('2.3.6 cannot DM a non-friend', async ({ page, browser }) => {
    const id = uid()
    await register(page, `nofrA${id}@test.com`, `nofrA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `nofrB${id}@test.com`, `nofrB${id}`)

    // nofrA tries to open DM via API directly (no friendship)
    const resp = await page.request.post('/api/directs/open', {
      data: { userId: await page2.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id)) },
    })
    expect(resp.status()).toBe(403)
    await ctx2.close()
  })

  test('2.3.2 friend request note is visible to recipient', async ({ page, browser }) => {
    const id = uid()
    await register(page, `noteA${id}@test.com`, `noteA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `noteB${id}@test.com`, `noteB${id}`)

    // Send request with a note via API (UI may not expose this field)
    const noteMsg = `Hi from noteA ${id}`
    const resp = await page.request.post('/api/friends/requests', {
      data: { username: `noteB${id}`, message: noteMsg },
    })
    expect(resp.status()).toBe(201)

    // Recipient checks their pending requests via API
    const reqsResp = await page2.request.get('/api/friends/requests')
    expect(reqsResp.status()).toBe(200)
    const { received } = await reqsResp.json()
    expect(received.length).toBeGreaterThan(0)
    expect(received[0].message).toBe(noteMsg)
    await ctx2.close()
  })

  test('2.3.3 decline friend request — request removed, no friendship created', async ({ page, browser }) => {
    const id = uid()
    await register(page, `decA${id}@test.com`, `decA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `decB${id}@test.com`, `decB${id}`)

    // Send request
    await page.request.post('/api/friends/requests', { data: { username: `decB${id}` } })

    // Recipient declines
    const reqsResp = await page2.request.get('/api/friends/requests')
    const { received } = await reqsResp.json()
    const requestId = received[0].id
    const declineResp = await page2.request.post(`/api/friends/requests/${requestId}/decline`)
    expect(declineResp.status()).toBe(200)

    // No friendship was created
    const friendsResp = await page2.request.get('/api/friends')
    const friends = await friendsResp.json()
    expect(friends.every((f: any) => f.username !== `decA${id}`)).toBe(true)
    await ctx2.close()
  })

  test('2.3.5 user-to-user ban blocks new DM', async ({ page, browser }) => {
    const id = uid()
    await register(page, `banA${id}@test.com`, `banA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `banB${id}@test.com`, `banB${id}`)

    // Become friends first
    await page.request.post('/api/friends/requests', { data: { username: `banB${id}` } })
    const reqs = await page2.request.get('/api/friends/requests')
    const { received } = await reqs.json()
    await page2.request.post(`/api/friends/requests/${received[0].id}/accept`)

    // banA bans banB
    const banBId = await page2.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))
    const banResp = await page.request.post('/api/friends/bans', { data: { userId: banBId } })
    expect(banResp.status()).toBe(200)

    // banB can no longer open DM with banA
    const banAId = await page.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))
    const dmResp = await page2.request.post('/api/directs/open', { data: { userId: banAId } })
    expect(dmResp.status()).toBe(403)
    await ctx2.close()
  })

  test('2.3.5 user-to-user ban terminates friendship', async ({ page, browser }) => {
    const id = uid()
    await register(page, `bfA${id}@test.com`, `bfA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `bfB${id}@test.com`, `bfB${id}`)

    // Become friends
    await page.request.post('/api/friends/requests', { data: { username: `bfB${id}` } })
    const reqs = await page2.request.get('/api/friends/requests')
    const { received } = await reqs.json()
    await page2.request.post(`/api/friends/requests/${received[0].id}/accept`)

    // Confirm they are friends
    const beforeFriends = await page.request.get('/api/friends')
    const before = await beforeFriends.json()
    expect(before.some((f: any) => f.username === `bfB${id}`)).toBe(true)

    // bfA bans bfB
    const bfBId = await page2.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))
    await page.request.post('/api/friends/bans', { data: { userId: bfBId } })

    // Friendship is terminated
    const afterFriends = await page.request.get('/api/friends')
    const after = await afterFriends.json()
    expect(after.every((f: any) => f.username !== `bfB${id}`)).toBe(true)
    await ctx2.close()
  })

  test('pending friend requests visible in Contacts page', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `reqA${id}@test.com`, `reqA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `reqB${id}@test.com`, `reqB${id}`)

    await sendFriendRequest(page, `reqB${id}`)

    // Bob sees pending request
    await page2.locator('a[href="/contacts"]').click()
    await expect(page2.locator(`text=reqA${id}`).first()).toBeVisible({ timeout: 6_000 })
    await expect(page2.locator('button:has-text("Accept")')).toBeVisible()
    await ctx2.close()
  })
})
