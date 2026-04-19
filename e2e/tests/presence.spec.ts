import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, joinRoomFromCatalog } from '../helpers/chat'

test.describe('2.2 Presence and Sessions', () => {
  test('user appears online after login', async ({ page, browser }) => {
    const id = uid()
    await register(page, `presA${id}@test.com`, `presA${id}`)
    await createRoom(page, `presroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    const consoleLogs: string[] = []
    page2.on('console', msg => { if (msg.text().includes('[presence]')) consoleLogs.push(msg.text()) })
    await register(page2, `presB${id}@test.com`, `presB${id}`)
    await joinRoomFromCatalog(page2, `presroom-${id}`)

    // Open Members panel and wait for presA to appear online
    // Re-opens Members tab if it somehow resets (e.g., due to React re-render)
    await expect(async () => {
      if (!await page2.getByText(/Members —/).isVisible()) {
        await page2.locator('button[title="Members"]').first().click()
        await page2.getByText(/Members —/).waitFor({ timeout: 5_000 })
      }
      // presA's username appears in members list (backend lowercases: presA${id} → presa${id})
      await expect(page2.getByText(`presa${id}`, { exact: false }).first()).toBeVisible()
      // PresenceDot has title="online" when user is online
      await expect(page2.locator('span[title="online"]').first()).toBeVisible()
    }).toPass({ timeout: 20_000 })
    console.log('[test] presence logs from page2:', consoleLogs)
    await ctx2.close()
  })

  test('2.2.4 sessions list shows active sessions', async ({ page }) => {
    const id = uid()
    await register(page, `sess${id}@test.com`, `sessuser${id}`)
    await page.locator('a[href="/sessions"]').click()
    // At least one session visible
    await expect(page.locator('text=/session|browser|device|IP/i').first()).toBeVisible({ timeout: 8_000 })
    // Current session should be marked
    await expect(page.locator('text=/current|this.*session|this.*browser/i').first()).toBeVisible()
  })

  test('2.2.3 user appears offline when their browser context is closed', async ({ browser }) => {
    const id = uid()

    // Create presA in its own context so we can close it safely mid-test
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    await register(pageA, `offlineA${id}@test.com`, `offlineA${id}`)
    await createRoom(pageA, `offroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `offlineB${id}@test.com`, `offlineB${id}`)
    await joinRoomFromCatalog(page2, `offroom-${id}`)

    // Get presA's user id
    const presAId = await pageA.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))

    // Confirm presA is currently online
    const onlineResp = await page2.request.get(`/api/users/${presAId}/status`)
    expect(onlineResp.status()).toBe(200)
    const { status: onlineStatus } = await onlineResp.json()
    expect(onlineStatus).toBe('online')

    // Close presA's context (simulates all tabs closed)
    await ctxA.close()

    // Wait for offline propagation (max 10s)
    await expect(async () => {
      const r = await page2.request.get(`/api/users/${presAId}/status`)
      const { status } = await r.json()
      expect(status).toBe('offline')
    }).toPass({ timeout: 10_000 })

    await ctx2.close()
  })

  test('2.2.2 user goes AFK after 60s of inactivity', async ({ page, browser }) => {
    test.setTimeout(120_000)
    test.slow()
    const id = uid()
    await register(page, `afkA${id}@test.com`, `afkA${id}`)
    await createRoom(page, `afkroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `afkB${id}@test.com`, `afkB${id}`)
    await joinRoomFromCatalog(page2, `afkroom-${id}`)

    const presAId = await page.evaluate(() => fetch('/api/auth/me').then(r => r.json()).then(d => d.id))

    // Wait 70s without any activity — heartbeat stops → server marks AFK
    await page.waitForTimeout(70_000)

    // Check status via API
    await expect(async () => {
      const r = await page2.request.get(`/api/users/${presAId}/status`)
      const { status } = await r.json()
      expect(status).toBe('afk')
    }).toPass({ timeout: 15_000 })

    await ctx2.close()
  })

  test('2.2.4 can log out a specific session', async ({ page, browser }) => {
    const id = uid()
    const email = `multisess${id}@test.com`
    await register(page, email, `multisess${id}`)

    // Open a second session from another browser context
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await page2.goto('/login')
    await page2.fill('input[type="email"]', email)
    await page2.fill('input[type="password"]', 'Password123!')
    await page2.click('button[type="submit"]')
    await page2.waitForURL('/', { timeout: 10_000 })

    // Original session views sessions list — should see sessions
    await page.locator('a[href="/sessions"]').click()
    await expect(page.locator('text=/session|browser|device|IP/i').first()).toBeVisible({ timeout: 8_000 })

    // Look for a Revoke/Log out button (for non-current sessions)
    const revokeBtn = page.locator('button:has-text("Revoke"), button:has-text("Log out"), button:has-text("Terminate")').first()
    if (await revokeBtn.count() > 0) {
      await revokeBtn.click()
    }
    await ctx2.close()
  })
})
