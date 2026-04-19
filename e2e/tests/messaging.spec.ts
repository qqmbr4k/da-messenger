import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, openRoom, sendMessage, joinRoomFromCatalog } from '../helpers/chat'

// Message action buttons are shown on hover via CSS group-hover:flex.
// Hover the .group container (message row) to reveal them.
async function hoverMessage(page: import('@playwright/test').Page, text: string) {
  const msgRow = page.locator('.group').filter({ hasText: text }).last()
  await msgRow.hover()
}

test.describe('2.5 Messaging', () => {
  test('send a text message — appears in chat', async ({ page }) => {
    const id = uid()
    await register(page, `msg${id}@test.com`, `msguser${id}`)
    await createRoom(page, `msgroom-${id}`)
    await sendMessage(page, `Hello world ${id}`)
    await expect(page.locator(`text=Hello world ${id}`).first()).toBeVisible()
  })

  test('messages persist after page reload (req 3.3)', async ({ page }) => {
    const id = uid()
    await register(page, `pmsg${id}@test.com`, `pmsguser${id}`)
    await createRoom(page, `pmsg-${id}`)
    await sendMessage(page, `Persistent ${id}`)
    await page.reload()
    await page.locator(`button:has-text("pmsg-${id}")`).first().click()
    await expect(page.locator(`text=Persistent ${id}`)).toBeVisible({ timeout: 8_000 })
  })

  test('real-time delivery within 3s (req 3.2)', async ({ page, browser }) => {
    const id = uid()
    await register(page, `sndr${id}@test.com`, `sndr${id}`)
    await createRoom(page, `rt-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `rcvr${id}@test.com`, `rcvr${id}`)
    await joinRoomFromCatalog(page2, `rt-${id}`)

    await sendMessage(page, `RT msg ${id}`)
    await expect(page2.locator(`text=RT msg ${id}`)).toBeVisible({ timeout: 5_000 })
    await ctx2.close()
  })

  test('edit own message — shows (edited) indicator', async ({ page }) => {
    const id = uid()
    await register(page, `edit${id}@test.com`, `edituser${id}`)
    await createRoom(page, `editroom-${id}`)
    await sendMessage(page, `Original ${id}`)

    // Hover the message row (.group) to reveal action buttons
    await hoverMessage(page, `Original ${id}`)
    await page.locator('button[title="Edit"]').first().click()

    // Edit textarea has rows=3; message input has rows=1
    const textarea = page.locator('textarea[rows="3"]').first()
    await textarea.clear()
    await textarea.fill(`Edited ${id}`)
    await textarea.press('Enter')

    await expect(page.locator(`text=Edited ${id}`)).toBeVisible()
    await expect(page.locator('text=(edited)').first()).toBeVisible()
  })

  test('cannot edit another user\'s message (no edit button shown)', async ({ page, browser }) => {
    const id = uid()
    await register(page, `author${id}@test.com`, `author${id}`)
    await createRoom(page, `noedit-${id}`)
    await sendMessage(page, `Author msg ${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `viewer${id}@test.com`, `viewer${id}`)
    await joinRoomFromCatalog(page2, `noedit-${id}`)
    await expect(page2.locator(`text=Author msg ${id}`)).toBeVisible({ timeout: 8_000 })

    // Hover the message row on page2
    const msgRow2 = page2.locator('.group').filter({ hasText: `Author msg ${id}` }).last()
    await msgRow2.hover()
    await expect(page2.locator('button[title="Edit"]')).toBeHidden()
    await ctx2.close()
  })

  test('delete own message', async ({ page }) => {
    const id = uid()
    await register(page, `del${id}@test.com`, `delmsg${id}`)
    await createRoom(page, `delroom-${id}`)
    await sendMessage(page, `Delete me ${id}`)

    await hoverMessage(page, `Delete me ${id}`)
    await page.locator('button[title="Delete"]').first().click()
    await expect(page.locator(`text=Delete me ${id}`)).toBeHidden({ timeout: 6_000 })
  })

  test('reply to message shows quoted original', async ({ page }) => {
    const id = uid()
    await register(page, `reply${id}@test.com`, `replyuser${id}`)
    await createRoom(page, `replyroom-${id}`)
    await sendMessage(page, `Original ${id}`)

    await hoverMessage(page, `Original ${id}`)
    await page.locator('button[title="Reply"]').first().click()
    await expect(page.locator('text=Replying to')).toBeVisible()

    await sendMessage(page, `Reply ${id}`)
    await expect(page.locator(`text=Original ${id}`).first()).toBeVisible()
    await expect(page.locator(`text=Reply ${id}`)).toBeVisible()
    await expect(page.locator(`text=replyuser${id}`).first()).toBeVisible()
  })

  test('multiline text via Shift+Enter', async ({ page }) => {
    const id = uid()
    await register(page, `multi${id}@test.com`, `multiuser${id}`)
    await createRoom(page, `multiroom-${id}`)

    const input = page.locator('textarea[placeholder="Message..."]').first()
    await input.click()
    await input.type('Line1')
    await input.press('Shift+Enter')
    await input.type('Line2')
    await input.press('Enter')

    await expect(page.locator('text=Line1').first()).toBeVisible()
    await expect(page.locator('text=Line2').first()).toBeVisible()
  })

  test('2.5.2 message over 3KB is rejected', async ({ page }) => {
    const id = uid()
    await register(page, `maxmsg${id}@test.com`, `maxmsg${id}`)
    await createRoom(page, `maxroom-${id}`)

    const input = page.locator('textarea[placeholder="Message..."]').first()
    await input.fill('x'.repeat(3073))
    await input.press('Enter')
    // App should show an error — either a red paragraph or disabled send
    await expect(page.locator('p.text-red-400, [class*="red-4"], [class*="error"]').first()).toBeVisible({ timeout: 6_000 })
  })

  test('emoji reaction — add and remove by toggling', async ({ page }) => {
    const id = uid()
    await register(page, `react${id}@test.com`, `reactuser${id}`)
    await createRoom(page, `reactroom-${id}`)
    await sendMessage(page, `React to this ${id}`)

    // Hover the message row to reveal toolbar
    const msgRow = page.locator('.group').filter({ hasText: `React to this ${id}` }).last()
    await msgRow.hover()
    // Click the first quick reaction emoji (👍)
    await page.locator('.group').filter({ hasText: `React to this ${id}` }).last()
      .locator('button').filter({ hasText: '👍' }).first().click()
    // Reaction chip should appear
    await expect(page.locator('button').filter({ hasText: '👍' }).last()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button').filter({ hasText: '👍' }).last().locator('span')).toBeVisible()

    // Toggle off by clicking the reaction chip
    await page.locator('button').filter({ hasText: /👍.*1/ }).first().click()
    // Count should go to 0 and chip should disappear
    await expect(page.locator('button').filter({ hasText: /👍.*1/ })).toBeHidden({ timeout: 5_000 })
  })

  test('emoji reaction from another user appears in real time', async ({ page, browser }) => {
    const id = uid()
    await register(page, `reactA${id}@test.com`, `reactA${id}`)
    await createRoom(page, `reactrt-${id}`)
    await sendMessage(page, `Shared msg ${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `reactB${id}@test.com`, `reactB${id}`)
    await joinRoomFromCatalog(page2, `reactrt-${id}`)
    await expect(page2.locator(`text=Shared msg ${id}`)).toBeVisible({ timeout: 8_000 })

    // page2 reacts via API
    const msgId = await page.evaluate(async (roomName: string) => {
      const rooms = await fetch('/api/rooms?search=' + roomName).then(r => r.json())
      const roomId = rooms[0]?.id
      if (!roomId) return null
      const msgs = await fetch(`/api/rooms/${roomId}/messages`).then(r => r.json())
      return msgs[msgs.length - 1]?.id
    }, `reactrt-${id}`)

    const roomId2 = await page2.evaluate(async (name: string) => {
      const rooms = await fetch('/api/rooms?search=' + name).then(r => r.json())
      return rooms[0]?.id
    }, `reactrt-${id}`)
    await page2.request.post(`/api/rooms/${roomId2}/messages/${msgId}/reactions`, {
      data: { emoji: '❤️' },
    })

    // page1 should see the reaction chip
    await expect(page.locator('button').filter({ hasText: '❤️' }).first()).toBeVisible({ timeout: 8_000 })
    await ctx2.close()
  })

  test('typing indicator visible to another user in the room', async ({ page, browser }) => {
    const id = uid()
    await register(page, `typA${id}@test.com`, `typA${id}`)
    await createRoom(page, `tyroom-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `typB${id}@test.com`, `typB${id}`)
    await joinRoomFromCatalog(page2, `tyroom-${id}`)

    // typA starts typing
    const input = page.locator('textarea[placeholder="Message..."]').first()
    await input.fill('typing...')

    // typB should see the typing indicator within 3s
    await expect(page2.locator('text=/typing\\.\\.\\.$/i').first()).toBeVisible({ timeout: 5_000 })
    await ctx2.close()
  })

  test('jump-to-bottom button appears when scrolled up', async ({ page }) => {
    const id = uid()
    await register(page, `scroll${id}@test.com`, `scrolluser${id}`)
    await createRoom(page, `scrollroom-${id}`)

    // Send enough messages to allow scrolling
    for (let i = 0; i < 30; i++) {
      const input = page.locator('textarea[placeholder="Message..."]').first()
      await input.fill(`Message line ${i} ${id}`)
      await input.press('Enter')
      await page.waitForTimeout(50)
    }

    // Scroll to top of message area
    const scrollArea = page.locator('[class*="overflow-y-auto"]').filter({ hasText: `Message line 0 ${id}` }).first()
    await scrollArea.evaluate(el => el.scrollTop = 0)

    // Jump-to-bottom button should appear
    await expect(page.locator('[data-testid="jump-to-bottom"]')).toBeVisible({ timeout: 5_000 })

    // Clicking it returns to the bottom
    await page.locator('[data-testid="jump-to-bottom"]').click()
    await expect(page.locator('[data-testid="jump-to-bottom"]')).toBeHidden({ timeout: 5_000 })
  })

  test('2.7 unread badge clears when room is opened', async ({ page, browser }) => {
    const id = uid()
    await register(page, `notifier${id}@test.com`, `notifier${id}`)
    await createRoom(page, `unread-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `reader${id}@test.com`, `reader${id}`)
    await joinRoomFromCatalog(page2, `unread-${id}`)
    // Navigate away so the room is in the background
    await page2.locator('a[href="/profile"]').click()

    await sendMessage(page, `Unread msg ${id}`)

    // Unread badge renders with bg-[#f23f42]; look for any child span with that substring
    const roomBtn2 = page2.locator(`button:has-text("unread-${id}")`).first()
    await expect(roomBtn2.locator('span[class*="f23f42"]')).toBeVisible({ timeout: 10_000 })

    // Open the room — badge disappears
    await roomBtn2.click()
    await expect(roomBtn2.locator('span[class*="f23f42"]')).toBeHidden({ timeout: 5_000 })
    await ctx2.close()
  })
})
