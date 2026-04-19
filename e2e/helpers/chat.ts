import { Page, expect } from '@playwright/test'

/**
 * Create a room by hovering the Rooms section to reveal the + button.
 * name is auto-lowercased and space→dash by the app.
 */
export async function createRoom(page: Page, name: string, description = '', isPrivate = false) {
  // Hover over the Rooms section header to reveal the + button
  const sectionHeader = page.locator('text=Rooms').first()
  await sectionHeader.hover()
  await page.locator('button[title="Add rooms"]').click()

  // Fill the Create Room modal
  await page.locator('input[placeholder="e.g. general"]').fill(name)
  if (description) {
    await page.locator('textarea[placeholder*="room about"]').fill(description)
  }
  if (isPrivate) {
    await page.locator('label:has-text("Private")').click()
  }
  await page.locator('button:has-text("Create Room")').click()
  // Modal closes and room is selected
  await expect(page.locator(`button:has-text("${name}")`).first()).toBeVisible({ timeout: 8_000 })
}

/** Click a room by name in the sidebar */
export async function openRoom(page: Page, roomName: string) {
  await page.locator(`button:has-text("${roomName}")`).first().click()
  // Wait for the message input to appear (room loaded)
  await expect(page.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 6_000 })
}

/** Type and send a message; waits for it to appear in chat */
export async function sendMessage(page: Page, text: string) {
  const input = page.locator('textarea[placeholder="Message..."]').first()
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator(`text=${text}`).last()).toBeVisible({ timeout: 8_000 })
}

/** Open the channel settings/manage modal */
export async function openManageModal(page: Page) {
  await page.locator('button:has-text("Settings")').first().click()
  await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible({ timeout: 5_000 })
}

/** Get the manage room modal locator (must be open) */
export function getModal(page: Page) {
  return page.locator('[data-testid="manage-room-modal"]')
}

/** Click a tab inside the manage room modal */
export async function clickModalTab(page: Page, tab: string) {
  await page.locator(`[data-testid="tab-${tab}"]`).click()
}

/** Join a public room from the catalog */
export async function joinRoomFromCatalog(page: Page, roomName: string) {
  await page.locator('a[href="/rooms"]').click()
  // Catalog shows "# roomname"; sidebar shows "roomname" — use # prefix to avoid strict mode
  await page.locator(`text=# ${roomName}`).first().waitFor({ timeout: 8_000 })
  await page.locator(`text=# ${roomName}`).first().locator('../..').locator('button:has-text("Join")').click()
  // Click the room in sidebar to open it
  await page.locator(`button:has-text("${roomName}")`).first().click()
  // Wait for ChatWindow to fully mount (socket join_room emitted, ready for presence)
  await expect(page.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 10_000 })
}
