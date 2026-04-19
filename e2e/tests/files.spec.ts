import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'
import { createRoom, openRoom, joinRoomFromCatalog, clickModalTab } from '../helpers/chat'
import path from 'path'
import fs from 'fs'
import os from 'os'

function makeTempFile(name: string, content: string): string {
  const p = path.join(os.tmpdir(), name)
  fs.writeFileSync(p, content)
  return p
}

async function attachAndSend(page: import('@playwright/test').Page, filePath: string) {
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('button[title="Attach file"]').click(),
  ])
  await fc.setFiles(filePath)
  await page.locator('textarea[placeholder="Message..."]').first().press('Enter')
}

test.describe('2.6 Attachments', () => {
  test('upload file in room — filename link appears in message', async ({ page }) => {
    const id = uid()
    await register(page, `fup${id}@test.com`, `fupuser${id}`)
    await createRoom(page, `fileroom-${id}`)

    const filePath = makeTempFile(`attach-${id}.txt`, `content ${id}`)
    await attachAndSend(page, filePath)

    await expect(page.locator(`text=attach-${id}.txt`)).toBeVisible({ timeout: 10_000 })
    fs.unlinkSync(filePath)
  })

  test('upload file in DM — filename link appears', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `dmfA${id}@test.com`, `dmfA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `dmfB${id}@test.com`, `dmfB${id}`)

    // Become friends
    await page.locator('a[href="/contacts"]').click()
    await page.locator('input[placeholder="Enter a username"]').fill(`dmfB${id}`)
    await page.locator('button:has-text("Send Request")').click()
    await page2.locator('a[href="/contacts"]').click()
    await page2.locator('button:has-text("Accept")').first().click()

    // Reload contacts and open DM
    await page.goto('/contacts')
    const mainArea = page.getByRole('main')
    await expect(mainArea.locator(`text=dmfB${id}`).first()).toBeVisible({ timeout: 8_000 })
    await mainArea.locator(`text=dmfB${id}`).first().hover()
    await mainArea.locator('button', { hasText: /^Message$/ }).first().click()
    await expect(page.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 15_000 })

    const filePath = makeTempFile(`dm-${id}.txt`, 'dm file')
    await attachAndSend(page, filePath)
    await expect(page.locator(`text=dm-${id}.txt`)).toBeVisible({ timeout: 10_000 })
    fs.unlinkSync(filePath)
    await ctx2.close()
  })

  test('uploaded file appears in Files tab', async ({ page }) => {
    const id = uid()
    await register(page, `ftab${id}@test.com`, `ftabuser${id}`)
    await createRoom(page, `ftabroom-${id}`)

    const filePath = makeTempFile(`ftab-${id}.txt`, 'files tab')
    await attachAndSend(page, filePath)
    await expect(page.locator(`text=ftab-${id}.txt`)).toBeVisible({ timeout: 10_000 })

    // Open Files panel (icon button in header)
    await page.locator('button[title="Files"]').first().click()
    await expect(page.locator(`text=ftab-${id}.txt`)).toBeVisible()
    fs.unlinkSync(filePath)
  })

  test('original filename is preserved', async ({ page }) => {
    const id = uid()
    await register(page, `fname${id}@test.com`, `fnameuser${id}`)
    await createRoom(page, `fnameroom-${id}`)

    const originalName = `special-file-${id}.pdf`
    const filePath = makeTempFile(originalName, 'content')
    await attachAndSend(page, filePath)
    await expect(page.locator(`text=${originalName}`)).toBeVisible({ timeout: 10_000 })
    fs.unlinkSync(filePath)
  })

  test('paste image from clipboard attaches it', async ({ page }) => {
    const id = uid()
    await register(page, `paste${id}@test.com`, `pasteuser${id}`)
    await createRoom(page, `pasteroom-${id}`)

    // Focus textarea and simulate a paste event with a file
    await page.locator('textarea[placeholder="Message..."]').first().focus()
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1; canvas.height = 1
      canvas.toBlob(blob => {
        if (!blob) return
        const file = new File([blob], 'pasted.png', { type: 'image/png' })
        const dt = new DataTransfer()
        dt.items.add(file)
        const ta = document.querySelector('textarea')!
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
      }, 'image/png')
    })
    // Preview chip should appear
    await expect(page.locator('text=pasted.png')).toBeVisible({ timeout: 5_000 })
  })

  test('2.6.4 banned member loses file access (API returns 403)', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `faccadm${id}@test.com`, `faccadm${id}`)
    await createRoom(page, `faccess-${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `faccusr${id}@test.com`, `faccusr${id}`)
    await joinRoomFromCatalog(page2, `faccess-${id}`)

    // Member uploads a file
    const filePath = makeTempFile(`facc-${id}.txt`, 'secret')
    await attachAndSend(page2, filePath)
    await expect(page2.locator(`text=facc-${id}.txt`)).toBeVisible({ timeout: 10_000 })

    // Get the attachment link href
    const fileLink = page2.locator(`a:has-text("facc-${id}.txt")`).first()
    const href = await fileLink.getAttribute('href') ?? ''
    expect(href).toBeTruthy()

    // Admin bans the member using proper modal scoping
    await page.locator('button:has-text("Settings")').first().click()
    await expect(page.locator('[data-testid="manage-room-modal"]')).toBeVisible()
    await clickModalTab(page, 'members')
    const modal = page.locator('[data-testid="manage-room-modal"]')
    await expect(modal.getByText(`faccusr${id}`, { exact: true })).toBeVisible({ timeout: 6_000 })
    await modal.getByText(`faccusr${id}`, { exact: true }).locator('..').locator('button:has-text("Ban")').click()

    // Banned user's request for the file should be 403
    const resp = await page2.request.get(href)
    expect(resp.status()).toBe(403)
    fs.unlinkSync(filePath)
    await ctx2.close()
  })
})
