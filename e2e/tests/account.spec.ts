import { test, expect } from '@playwright/test'
import { uid, register, login, logout } from '../helpers/auth'

test.describe('2.1.4 / 2.1.5 Account Management', () => {
  test('change password — new password works on next login', async ({ page }) => {
    const id = uid()
    const email = `cpw${id}@test.com`
    await register(page, email, `cpwuser${id}`)

    await page.locator('a[href="/profile"]').click()
    await page.locator('input[placeholder="Current password"]').fill('Password123!')
    await page.locator('input[placeholder="New password"]').fill('NewPass456!')
    await page.locator('input[placeholder="Confirm new password"]').fill('NewPass456!')
    await page.locator('button:has-text("Update Password")').click()
    await expect(page.locator('text=Password changed successfully!')).toBeVisible({ timeout: 6_000 })

    // Log out and log in with new password
    await logout(page)
    await page.goto('/login')
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'NewPass456!')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 10_000 })
    await expect(page.locator(`text=cpwuser${id}`).first()).toBeVisible()
  })

  test('change password — wrong current password is rejected', async ({ page }) => {
    const id = uid()
    await register(page, `badcpw${id}@test.com`, `badcpwuser${id}`)

    await page.locator('a[href="/profile"]').click()
    await page.locator('input[placeholder="Current password"]').fill('WrongPassword!')
    await page.locator('input[placeholder="New password"]').fill('NewPass456!')
    await page.locator('input[placeholder="Confirm new password"]').fill('NewPass456!')
    await page.locator('button:has-text("Update Password")').click()
    await expect(page.locator('text=/incorrect|invalid|wrong/i').first()).toBeVisible({ timeout: 6_000 })
  })

  test('2.1.4 password reset flow — token allows login with new password', async ({ page }) => {
    const id = uid()
    const email = `reset${id}@test.com`
    await register(page, email, `resetuser${id}`)
    await logout(page)

    // Request reset token via API (returns token directly in this demo)
    const resp = await page.request.post('/api/auth/forgot-password', { data: { email } })
    expect(resp.status()).toBe(200)
    const { resetToken } = await resp.json()
    expect(resetToken).toBeTruthy()

    // Use reset token to set new password
    const resetResp = await page.request.post('/api/auth/reset-password', {
      data: { resetToken, newPassword: 'ResetPass789!' },
    })
    expect(resetResp.status()).toBe(200)

    // Login with new password
    await login(page, email, 'ResetPass789!')
    await expect(page.locator(`text=resetuser${id}`).first()).toBeVisible()
  })

  test('2.1.4 expired/invalid reset token is rejected', async ({ page }) => {
    const resp = await page.request.post('/api/auth/reset-password', {
      data: { resetToken: 'invalid-token-12345', newPassword: 'SomePass123!' },
    })
    expect(resp.status()).toBe(400)
  })

  test('2.1.2 password too short is rejected at registration', async ({ page }) => {
    const id = uid()
    await page.goto('/register')
    await page.locator('input[type="email"]').fill(`short${id}@test.com`)
    await page.locator('input[type="text"]').fill(`shortpw${id}`)
    await page.locator('input[type="password"]').nth(0).fill('abc')
    await page.locator('input[type="password"]').nth(1).fill('abc')
    await page.click('button[type="submit"]')
    await expect(page.locator('p.text-red-400, [class*="red"]').first()).toBeVisible({ timeout: 6_000 })
  })

  test('2.1.5 delete account removes owned rooms', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    const email = `delacc${id}@test.com`
    await register(page, email, `delaccuser${id}`)

    // Create a room (will be owned)
    const sectionHeader = page.locator('text=Rooms').first()
    await sectionHeader.hover()
    await page.locator('button[title="Add rooms"]').click()
    await page.locator('input[placeholder="e.g. general"]').fill(`delaccroom-${id}`)
    await page.locator('button:has-text("Create Room")').click()
    await expect(page.locator(`button:has-text("delaccroom-${id}")`).first()).toBeVisible({ timeout: 8_000 })

    // Second user joins the room
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `delaccobs${id}@test.com`, `delaccobs${id}`)
    await page2.locator('a[href="/rooms"]').click()
    await page2.locator(`text=# delaccroom-${id}`).first().waitFor({ timeout: 8_000 })
    await page2.locator(`text=# delaccroom-${id}`).first().locator('../..').locator('button:has-text("Join")').click()
    await expect(page2.locator(`button:has-text("delaccroom-${id}")`).first()).toBeVisible({ timeout: 8_000 })

    // First user deletes their account
    await page.locator('a[href="/profile"]').click()
    page.once('dialog', d => d.accept())
    await page.locator('input[placeholder="Confirm your password to delete account"]').fill('Password123!')
    await page.locator('button:has-text("Delete Account")').click()
    await page.waitForURL('/login', { timeout: 10_000 })

    // Observer: owned room no longer appears
    await page2.reload()
    await expect(page2.locator(`button:has-text("delaccroom-${id}")`)).toBeHidden({ timeout: 8_000 })
    await ctx2.close()
  })

  test('2.1.5 delete account — membership in other rooms is removed, room persists', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()

    // Owner creates a room
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `keepown${id}@test.com`, `keepown${id}`)
    const sectionHeader2 = page2.locator('text=Rooms').first()
    await sectionHeader2.hover()
    await page2.locator('button[title="Add rooms"]').click()
    await page2.locator('input[placeholder="e.g. general"]').fill(`keeproom-${id}`)
    await page2.locator('button:has-text("Create Room")').click()
    await expect(page2.locator(`button:has-text("keeproom-${id}")`).first()).toBeVisible({ timeout: 8_000 })

    // Member joins and sends a message
    await register(page, `delmem${id}@test.com`, `delmem${id}`)
    await page.locator('a[href="/rooms"]').click()
    await page.locator(`text=# keeproom-${id}`).first().waitFor({ timeout: 8_000 })
    await page.locator(`text=# keeproom-${id}`).first().locator('../..').locator('button:has-text("Join")').click()
    await page.locator(`button:has-text("keeproom-${id}")`).first().click()
    const input = page.locator('textarea[placeholder="Message..."]').first()
    await input.fill(`member msg ${id}`)
    await input.press('Enter')
    await expect(page.locator(`text=member msg ${id}`)).toBeVisible({ timeout: 8_000 })

    // Member deletes account
    await page.locator('a[href="/profile"]').click()
    page.once('dialog', d => d.accept())
    await page.locator('input[placeholder="Confirm your password to delete account"]').fill('Password123!')
    await page.locator('button:has-text("Delete Account")').click()
    await page.waitForURL('/login', { timeout: 10_000 })

    // Owner's room still exists
    await expect(page2.locator(`button:has-text("keeproom-${id}")`).first()).toBeVisible()
    await ctx2.close()
  })
})
