import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, openRoom, sendMessage, openManageModal, joinRoomFromCatalog, clickModalTab } from '../helpers/chat'

// Helper: in the Members tab, find a member's row by exact username and click an action button
async function clickMemberAction(page: import('@playwright/test').Page, username: string, action: string) {
  const modal = page.locator('[data-testid="manage-room-modal"]')
  // getByText with exact:true matches only the span with exactly that text (not ancestors)
  const userSpan = modal.getByText(username, { exact: true })
  await userSpan.locator('..').locator(`button:has-text("${action}")`).click()
}

test.describe('2.4.7 / 2.4.8 Room Moderation', () => {
  test('admin can delete any message', async ({ page, browser }) => {
    const id = uid()
    await register(page, `admin${id}@test.com`, `admin${id}`)
    await createRoom(page, `modroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `member${id}@test.com`, `member${id}`)
    await joinRoomFromCatalog(page2, `modroom-${id}`)
    await sendMessage(page2, `Member msg ${id}`)

    // Admin sees it
    await expect(page.locator(`text=Member msg ${id}`)).toBeVisible({ timeout: 6_000 })

    // Admin deletes
    await page.locator(`text=Member msg ${id}`).first().hover()
    await page.locator('button[title="Delete"]').first().click()
    await expect(page.locator(`text=Member msg ${id}`)).toBeHidden({ timeout: 6_000 })
    await ctx2.close()
  })

  test('2.4.8 removing member is treated as ban — cannot rejoin', async ({ page, browser }) => {
    const id = uid()
    await register(page, `kickadm${id}@test.com`, `kickadm${id}`)
    await createRoom(page, `kickroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `kicked${id}@test.com`, `kicked${id}`)
    await joinRoomFromCatalog(page2, `kickroom-${id}`)

    // Admin opens modal and bans the member (kick=ban per req 2.4.8)
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`kicked${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await clickMemberAction(page, `kicked${id}`, 'Ban')

    // Banned user no longer sees room
    await expect(page2.locator(`button:has-text("kickroom-${id}")`)).toBeHidden({ timeout: 8_000 })

    // Banned user CANNOT rejoin — API returns 403
    const roomId = await page.evaluate(async (name: string) => {
      const r = await fetch('/api/rooms?search=' + name)
      const data = await r.json()
      return data[0]?.id
    }, `kickroom-${id}`)
    expect(roomId).toBeTruthy()
    const joinResp = await page2.request.post(`/api/rooms/${roomId}/join`)
    expect(joinResp.status()).toBe(403)
    await ctx2.close()
  })

  test('ban member — removed and cannot rejoin', async ({ page, browser }) => {
    const id = uid()
    await register(page, `banadm${id}@test.com`, `banadm${id}`)
    await createRoom(page, `banroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `banned${id}@test.com`, `banned${id}`)
    await joinRoomFromCatalog(page2, `banroom-${id}`)

    // Admin bans
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`banned${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await clickMemberAction(page, `banned${id}`, 'Ban')

    // Banned user is removed
    await expect(page2.locator(`button:has-text("banroom-${id}")`)).toBeHidden({ timeout: 8_000 })

    // Banned user tries to join — API returns 403
    const joinResp = await page2.request.post(`/api/rooms/${await page.evaluate(async (name) => {
      const r = await fetch('/api/rooms?search=' + name)
      const data = await r.json()
      return data[0]?.id
    }, `banroom-${id}`)}/join`)
    expect(joinResp.status()).toBe(403)
    await ctx2.close()
  })

  test('banned user appears in Banned tab with Unban action', async ({ page, browser }) => {
    const id = uid()
    await register(page, `btabadm${id}@test.com`, `btabadm${id}`)
    await createRoom(page, `bantab-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `banee${id}@test.com`, `banee${id}`)
    await joinRoomFromCatalog(page2, `bantab-${id}`)

    // Ban via members tab
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`banee${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await clickMemberAction(page, `banee${id}`, 'Ban')

    // Check banned tab
    await clickModalTab(page, 'banned')
    const modal90 = page.locator('[data-testid="manage-room-modal"]')
    await expect(modal90.locator(`text=banee${id}`)).toBeVisible()
    await expect(modal90.locator('button:has-text("Unban")')).toBeVisible()
    await ctx2.close()
  })

  test('unban allows user to rejoin', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `unbadm${id}@test.com`, `unbadm${id}`)
    await createRoom(page, `unbanroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `unbanned${id}@test.com`, `unbanned${id}`)
    await joinRoomFromCatalog(page2, `unbanroom-${id}`)

    // Ban
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`unbanned${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await clickMemberAction(page, `unbanned${id}`, 'Ban')

    // Unban
    await clickModalTab(page, 'banned')
    const modal113 = page.locator('[data-testid="manage-room-modal"]')
    await expect(modal113.getByText(`unbanned${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await modal113.locator('button:has-text("Unban")').first().click()
    await expect(modal113.getByText(`unbanned${id}`, { exact: true })).toBeHidden({ timeout: 6_000 })

    // User can rejoin
    await joinRoomFromCatalog(page2, `unbanroom-${id}`)
    await expect(page2.locator(`button:has-text("unbanroom-${id}")`).first()).toBeVisible()
    await ctx2.close()
  })

  test('make and remove admin', async ({ page, browser }) => {
    const id = uid()
    await register(page, `ownmk${id}@test.com`, `ownmk${id}`)
    await createRoom(page, `adminroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `promoted${id}@test.com`, `promoted${id}`)
    await joinRoomFromCatalog(page2, `adminroom-${id}`)

    // Promote
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`promoted${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await clickMemberAction(page, `promoted${id}`, '+Admin')

    // Check Admins tab
    await clickModalTab(page, 'admins')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`promoted${id}`, { exact: true })).toBeVisible()

    // Remove admin
    await clickMemberAction(page, `promoted${id}`, 'Remove')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`promoted${id}`, { exact: true })).toBeHidden({ timeout: 6_000 })
    await ctx2.close()
  })

  test('owner row has no Ban button', async ({ page }) => {
    const id = uid()
    await register(page, `own${id}@test.com`, `ownprct${id}`)
    await createRoom(page, `ownprot-${id}`)
    await openManageModal(page)
    await clickModalTab(page, 'members')
    await expect(page.locator('[data-testid="manage-room-modal"]').getByText(`ownprct${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    const ownerSpan = page.locator('[data-testid="manage-room-modal"]').getByText(`ownprct${id}`, { exact: true })
    const ownerRow = ownerSpan.locator('..')
    await expect(ownerRow.locator('button:has-text("Ban")')).toBeHidden()
  })

  test('non-admin cannot ban a member (API returns 403)', async ({ page, browser }) => {
    const id = uid()
    await register(page, `naown${id}@test.com`, `naown${id}`)
    await createRoom(page, `naroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `naregular${id}@test.com`, `naregular${id}`)
    await joinRoomFromCatalog(page2, `naroom-${id}`)

    const ctx3 = await browser.newContext()
    const page3 = await ctx3.newPage()
    await register(page3, `natarget${id}@test.com`, `natarget${id}`)
    await joinRoomFromCatalog(page3, `naroom-${id}`)

    // Get room id
    const roomId = await page.evaluate(async (name: string) => {
      const r = await fetch('/api/rooms?search=' + name)
      const data = await r.json()
      return data[0]?.id
    }, `naroom-${id}`)
    const targetId = await page3.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))

    // Non-admin (page2) tries to ban target user via API
    const resp = await page2.request.delete(`/api/rooms/${roomId}/members/${targetId}`)
    expect(resp.status()).toBe(403)
    await ctx2.close()
    await ctx3.close()
  })
})
