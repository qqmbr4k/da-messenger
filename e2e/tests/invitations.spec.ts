import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, openManageModal, clickModalTab } from '../helpers/chat'

test.describe('2.4.9 Room Invitations', () => {
  test('invite user to private room — they can accept and join', async ({ page, browser }) => {
    const id = uid()
    await register(page, `invowner${id}@test.com`, `invowner${id}`)
    await createRoom(page, `invroom-${id}`, 'private invite room', true)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `invitee${id}@test.com`, `invitee${id}`)

    // Owner sends invitation via Invitations tab in modal
    await openManageModal(page)
    await clickModalTab(page, 'invitations')
    const modal = page.locator('[data-testid="manage-room-modal"]')
    await modal.locator('input[placeholder*="username" i]').fill(`invitee${id}`)
    await modal.locator('button:has-text("Send Invite")').click()
    await expect(modal.locator('text=/sent|invited/i')).toBeVisible({ timeout: 6_000 })

    // Invitee reloads and sees pending invitation in sidebar
    await page2.reload()
    await page2.waitForTimeout(1000)
    // Wait for "Invitations" section or "Join" button to appear
    await expect(page2.locator('text=Invitations').first()).toBeVisible({ timeout: 8_000 })
    // Click Join button next to the invited room
    await page2.locator('button:has-text("Join")').first().click()
    // After accepting, private room appears in sidebar
    await expect(page2.locator(`button:has-text("invroom-${id}")`).first()).toBeVisible({ timeout: 8_000 })
    await ctx2.close()
  })

  test('private room not joinable without invitation', async ({ page, browser }) => {
    const id = uid()
    await register(page, `privown${id}@test.com`, `privown${id}`)
    await createRoom(page, `noinvite-${id}`, 'no invite room', true)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `noinv${id}@test.com`, `noinv${id}`)
    // Private room should not appear in catalog
    await page2.locator('a[href="/rooms"]').click()
    await page2.waitForTimeout(1500)
    await expect(page2.locator(`p:has-text("# noinvite-${id}")`)).toBeHidden()
    await ctx2.close()
  })
})
