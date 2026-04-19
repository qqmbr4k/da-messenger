import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, openRoom, sendMessage, joinRoomFromCatalog, clickModalTab } from '../helpers/chat'

test.describe('2.4 Chat Rooms', () => {
  test('create a public room — appears in sidebar', async ({ page }) => {
    const id = uid()
    await register(page, `rooms${id}@test.com`, `roomsuser${id}`)
    await createRoom(page, `pub-${id}`, 'A public test room')
    await expect(page.locator(`button:has-text("pub-${id}")`).first()).toBeVisible()
  })

  test('duplicate room name is rejected', async ({ page }) => {
    const id = uid()
    await register(page, `uniq${id}@test.com`, `uniquser${id}`)
    await createRoom(page, `uniq-${id}`)

    // Try to create again with same name
    await page.locator('text=Rooms').first().hover()
    await page.locator('button[title="Add rooms"]').click()
    await page.locator('input[placeholder="e.g. general"]').fill(`uniq-${id}`)
    await page.locator('button:has-text("Create Room")').click()
    await expect(page.locator('p.text-red-400').first()).toBeVisible({ timeout: 6_000 })
  })

  test('2.4.3 public room catalog shows rooms with member count', async ({ page }) => {
    const id = uid()
    await register(page, `cat${id}@test.com`, `catuser${id}`)
    await createRoom(page, `catalog-${id}`, 'catalog test')

    await page.locator('a[href="/rooms"]').click()
    // Use p:has-text to target only catalog rows (sidebar uses spans, not p elements)
    await expect(page.locator(`p:has-text("# catalog-${id}")`).first()).toBeVisible({ timeout: 8_000 })
    // Member count visible
    await expect(page.locator('text=/\\d+ member/i').first()).toBeVisible()
  })

  test('2.4.3 room catalog search filters results', async ({ page }) => {
    const id = uid()
    await register(page, `search${id}@test.com`, `searchuser${id}`)
    await createRoom(page, `findme-${id}`)
    await createRoom(page, `other-${id}`)

    await page.locator('a[href="/rooms"]').click()
    await page.locator('input[placeholder="Search public rooms..."]').fill(`findme-${id}`)
    // p:has-text scopes to catalog rows only (not sidebar buttons)
    await expect(page.locator(`p:has-text("# findme-${id}")`).first()).toBeVisible()
    await expect(page.locator(`p:has-text("# other-${id}")`)).toBeHidden()
  })

  test('join a public room from catalog', async ({ page, browser }) => {
    const id = uid()
    await register(page, `owner${id}@test.com`, `owner${id}`)
    await createRoom(page, `joinme-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `joiner${id}@test.com`, `joiner${id}`)
    await joinRoomFromCatalog(page2, `joinme-${id}`)
    await expect(page2.locator(`button:has-text("joinme-${id}")`).first()).toBeVisible()
    await ctx2.close()
  })

  test('leave a room (non-owner)', async ({ page, browser }) => {
    const id = uid()
    const roomName = `leaveme-${id}`

    // Owner creates the room
    await register(page, `leaveown${id}@test.com`, `leaveown${id}`)
    await createRoom(page, roomName)

    // A second user joins
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `leaveuser${id}@test.com`, `leaveuser${id}`)
    await joinRoomFromCatalog(page2, roomName)

    // Second user opens the manage modal and goes to settings tab
    await page2.locator('button:has-text("Settings")').first().click()
    await expect(page2.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page2, 'settings')
    // Accept the confirm dialog and click Leave Room
    page2.once('dialog', d => d.accept())
    await page2.locator('button:has-text("Leave Room")').click()
    await expect(page2.locator(`button:has-text("${roomName}")`)).toBeHidden({ timeout: 8_000 })
    await ctx2.close()
  })

  test('2.4.6 delete room removes it from sidebar', async ({ page }) => {
    const id = uid()
    await register(page, `del${id}@test.com`, `deluser${id}`)
    await createRoom(page, `delroom-${id}`)
    await openRoom(page, `delroom-${id}`)

    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    page.once('dialog', d => d.accept())
    await page.locator('button:has-text("Delete Room")').click()
    await expect(page.locator(`button:has-text("delroom-${id}")`)).toBeHidden({ timeout: 8_000 })
  })

  test('private room not visible in catalog to others', async ({ page, browser }) => {
    const id = uid()
    await register(page, `priv${id}@test.com`, `privuser${id}`)
    await createRoom(page, `private-${id}`, 'secret room', true)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `priv2${id}@test.com`, `privuser2${id}`)
    await page2.locator('a[href="/rooms"]').click()
    await page2.waitForTimeout(2000)
    await expect(page2.locator(`p:has-text("# private-${id}")`)).toBeHidden()
    await ctx2.close()
  })

  test('2.4.5 owner cannot leave room — Leave Room button absent in settings', async ({ page }) => {
    const id = uid()
    await register(page, `ownlv${id}@test.com`, `ownlvuser${id}`)
    await createRoom(page, `ownlv-${id}`)
    await openRoom(page, `ownlv-${id}`)

    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    // Owner should NOT have a Leave Room button (only Delete Room)
    await expect(page.locator('button:has-text("Leave Room")')).toBeHidden()
    await expect(page.locator('button:has-text("Delete Room")')).toBeVisible()
  })

  test('2.4.5 owner cannot leave via API (returns 403)', async ({ page }) => {
    const id = uid()
    await register(page, `ownapi${id}@test.com`, `ownapiuser${id}`)
    await createRoom(page, `ownapi-${id}`)

    const roomId = await page.evaluate(async (name: string) => {
      const r = await fetch('/api/rooms?search=' + name)
      const data = await r.json()
      return data[0]?.id
    }, `ownapi-${id}`)
    const resp = await page.request.post(`/api/rooms/${roomId}/leave`)
    expect(resp.status()).toBe(403)
  })

  test('2.4.6 deleting room removes its messages (other users see it gone)', async ({ page, browser }) => {
    const id = uid()
    await register(page, `delmsown${id}@test.com`, `delmsown${id}`)
    await createRoom(page, `delms-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `delmsmem${id}@test.com`, `delmsmem${id}`)
    await joinRoomFromCatalog(page2, `delms-${id}`)
    await sendMessage(page2, `To be deleted ${id}`)
    await expect(page2.locator(`text=To be deleted ${id}`)).toBeVisible({ timeout: 6_000 })

    // Owner deletes the room
    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    page.once('dialog', d => d.accept())
    await page.locator('button:has-text("Delete Room")').click()
    await expect(page.locator(`button:has-text("delms-${id}")`)).toBeHidden({ timeout: 8_000 })

    // The member's view no longer shows the room
    await expect(page2.locator(`button:has-text("delms-${id}")`)).toBeHidden({ timeout: 8_000 })
    await ctx2.close()
  })

  test('room settings — update description', async ({ page }) => {
    const id = uid()
    await register(page, `desc${id}@test.com`, `descuser${id}`)
    await createRoom(page, `descroom-${id}`, 'original description')
    await openRoom(page, `descroom-${id}`)

    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    const descInput = page.locator('label:has-text("Description")').locator('..').locator('textarea, input').first()
    await descInput.clear()
    await descInput.fill(`updated description ${id}`)
    await page.locator('button:has-text("Save Changes")').click()

    // Reload and verify description persists
    await page.reload()
    await page.locator(`button:has-text("descroom-${id}")`).first().click()
    await expect(page.locator(`text=updated description ${id}`).first()).toBeVisible({ timeout: 8_000 })
  })

  test('room settings — change visibility from public to private hides from catalog', async ({ page, browser }) => {
    const id = uid()
    await register(page, `vis${id}@test.com`, `visuser${id}`)
    await createRoom(page, `visroom-${id}`, '', false) // start as public
    await openRoom(page, `visroom-${id}`)

    // Make private
    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    await page.locator('label:has-text("Private")').click()
    await page.locator('button:has-text("Save Changes")').click()

    // Another user cannot see it in the catalog
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `visobs${id}@test.com`, `visobs${id}`)
    await page2.locator('a[href="/rooms"]').click()
    await page2.waitForTimeout(2000)
    await expect(page2.locator(`p:has-text("# visroom-${id}")`)).toBeHidden()
    await ctx2.close()
  })

  test('room settings — update name', async ({ page }) => {
    const id = uid()
    await register(page, `rename${id}@test.com`, `renameuser${id}`)
    await createRoom(page, `before-${id}`)
    await openRoom(page, `before-${id}`)

    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'settings')
    // The Room Name label is followed by the name input
    const nameInput = page.locator('label:has-text("Room Name")').locator('..').locator('input')
    await nameInput.clear()
    await nameInput.fill(`after-${id}`)
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator(`button:has-text("after-${id}")`).first()).toBeVisible({ timeout: 6_000 })
  })
})
