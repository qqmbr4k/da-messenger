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

  test('invitee accepts and messages owner — owner gets unread notification', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `notifown${id}@test.com`, `notifown${id}`)
    await createRoom(page, `notifroom-${id}`, 'notif test room', true)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `notifinv${id}@test.com`, `notifinv${id}`)

    // Owner sends invitation
    await openManageModal(page)
    await clickModalTab(page, 'invitations')
    const modal = page.locator('[data-testid="manage-room-modal"]')
    await modal.locator('input[placeholder*="username" i]').fill(`notifinv${id}`)
    await modal.locator('button:has-text("Send Invite")').click()
    await expect(modal.locator('text=/sent|invited/i')).toBeVisible({ timeout: 6_000 })
    // Close modal so owner is no longer actively viewing the room UI
    await page.keyboard.press('Escape')

    // Navigate owner away from the room
    await page.locator('a[href="/profile"]').click()

    // Invitee accepts
    await page2.reload()
    await expect(page2.locator('text=Invitations').first()).toBeVisible({ timeout: 8_000 })
    await page2.locator('button:has-text("Join")').first().click()
    await expect(page2.locator(`button:has-text("notifroom-${id}")`).first()).toBeVisible({ timeout: 8_000 })

    // Invitee sends a message in the room
    await page2.locator(`button:has-text("notifroom-${id}")`).first().click()
    await expect(page2.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 8_000 })
    await page2.locator('textarea[placeholder="Message..."]').first().fill(`Hello owner! ${id}`)
    await page2.locator('textarea[placeholder="Message..."]').first().press('Enter')
    await expect(page2.locator(`text=Hello owner! ${id}`)).toBeVisible({ timeout: 8_000 })

    // Owner is on /profile — sidebar is always visible, badge should appear without reload
    const roomBtn = page.locator(`button:has-text("notifroom-${id}")`).first()
    await expect(roomBtn).toBeVisible({ timeout: 6_000 })
    await expect(roomBtn.locator('span[class*="e01e5a"], span[class*="red"]')).toBeVisible({ timeout: 10_000 })

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
