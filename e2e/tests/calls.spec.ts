import { test, expect } from '@playwright/test'
import { uid, register } from '../helpers/auth'

async function sendFriendRequest(page: import('@playwright/test').Page, toUsername: string) {
  await page.locator('a[href="/contacts"]').click()
  await page.locator('input[placeholder="Enter a username"]').fill(toUsername)
  await page.locator('button:has-text("Send Request")').click()
  await page.waitForTimeout(500)
}

async function acceptFirstRequest(page: import('@playwright/test').Page) {
  await page.locator('a[href="/contacts"]').click()
  await page.locator('button:has-text("Accept")').first().click()
  await page.waitForTimeout(500)
}

async function openDmWith(page: import('@playwright/test').Page, username: string) {
  await page.goto('/contacts')
  const main = page.getByRole('main')
  await expect(main.locator(`text=${username}`).first()).toBeVisible({ timeout: 10_000 })
  await main.locator(`text=${username}`).first().hover()
  await main.locator('button', { hasText: /^Message$/ }).first().click()
  await expect(page.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 15_000 })
}

test.describe('4. Voice / Video Calls', () => {
  test('4.1 call buttons visible in DM header', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `callA${id}@test.com`, `callA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `callB${id}@test.com`, `callB${id}`)

    await sendFriendRequest(page, `callB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page, `callB${id}`)
    await expect(page.locator('[data-testid="voice-call-btn"]')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-testid="video-call-btn"]')).toBeVisible({ timeout: 5_000 })

    await ctx2.close()
  })

  test('4.2 voice call — caller sees ringing state', async ({ page, browser }) => {
    test.setTimeout(60_000)
    const id = uid()
    await register(page, `vcallA${id}@test.com`, `vcallA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `vcallB${id}@test.com`, `vcallB${id}`)

    await sendFriendRequest(page, `vcallB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page, `vcallB${id}`)
    await page.locator('[data-testid="voice-call-btn"]').click()

    await expect(page.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Ringing')).toBeVisible({ timeout: 5_000 })

    await ctx2.close()
  })

  test('4.3 incoming call — callee sees incoming call modal with accept/reject', async ({ page, browser }) => {
    test.setTimeout(90_000)
    const id = uid()
    await register(page, `icalA${id}@test.com`, `icalA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `icalB${id}@test.com`, `icalB${id}`)

    await sendFriendRequest(page, `icalB${id}`)
    await acceptFirstRequest(page2)

    // Open DM on page2 (callee) so they are connected via socket
    await openDmWith(page2, `icalA${id}`)

    // Alice initiates voice call
    await openDmWith(page, `icalB${id}`)
    await page.locator('[data-testid="voice-call-btn"]').click()
    await expect(page.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 5_000 })

    // Bob sees incoming call
    await expect(page2.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 10_000 })
    await expect(page2.locator('[data-testid="accept-call"]')).toBeVisible({ timeout: 5_000 })
    await expect(page2.locator('[data-testid="reject-call"]')).toBeVisible({ timeout: 5_000 })

    await ctx2.close()
  })

  test('4.4 reject call — both modals close', async ({ page, browser }) => {
    test.setTimeout(90_000)
    const id = uid()
    await register(page, `rejA${id}@test.com`, `rejA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `rejB${id}@test.com`, `rejB${id}`)

    await sendFriendRequest(page, `rejB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page2, `rejA${id}`)
    await openDmWith(page, `rejB${id}`)
    await page.locator('[data-testid="voice-call-btn"]').click()

    await expect(page2.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 10_000 })
    await page2.locator('[data-testid="reject-call"]').click()

    await expect(page.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 8_000 })
    await expect(page2.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 8_000 })

    await ctx2.close()
  })

  test('4.5 hang up — both modals close', async ({ page, browser }) => {
    test.setTimeout(90_000)
    const id = uid()
    await register(page, `hangA${id}@test.com`, `hangA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `hangB${id}@test.com`, `hangB${id}`)

    await sendFriendRequest(page, `hangB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page2, `hangA${id}`)
    await openDmWith(page, `hangB${id}`)
    await page.locator('[data-testid="voice-call-btn"]').click()

    await expect(page2.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 10_000 })
    await page2.locator('[data-testid="accept-call"]').click()

    // Wait for at least one side to show the hangup button (connected or calling)
    await expect(page.locator('[data-testid="hangup"]')).toBeVisible({ timeout: 10_000 })

    // Caller hangs up
    await page.locator('[data-testid="hangup"]').click()

    await expect(page.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 8_000 })
    await expect(page2.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 8_000 })

    await ctx2.close()
  })

  test('4.7 voice call connects — both sides show call timer and it increments', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const id = uid()
    await register(page, `connA${id}@test.com`, `connA${id}`)

    const ctx2 = await browser.newContext({ permissions: ['camera', 'microphone'] })
    const page2 = await ctx2.newPage()
    await register(page2, `connB${id}@test.com`, `connB${id}`)

    await sendFriendRequest(page, `connB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page2, `connA${id}`)
    await openDmWith(page, `connB${id}`)
    await page.locator('[data-testid="voice-call-btn"]').click()

    await expect(page2.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 10_000 })
    await page2.locator('[data-testid="accept-call"]').click()

    // Both sides should reach connected state — timer must appear AND increment (proves live connection)
    await expect(page.locator('[data-testid="call-timer"]')).toBeVisible({ timeout: 30_000 })
    await expect(page2.locator('[data-testid="call-timer"]')).toBeVisible({ timeout: 15_000 })

    // Read initial timer value then wait 1.5s and confirm it advanced (timer is live, not stuck)
    const t0 = await page.locator('[data-testid="call-timer"]').textContent()
    await page.waitForTimeout(1500)
    const t1 = await page.locator('[data-testid="call-timer"]').textContent()
    expect(t0).not.toEqual(t1)

    // Remote audio track must be attached (srcObject on remote-video element)
    const hasRemoteStream = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="remote-video"]') as HTMLVideoElement | null
      return !!(v?.srcObject)
    })
    expect(hasRemoteStream).toBe(true)

    await page.locator('[data-testid="hangup"]').click()
    await expect(page.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 5_000 })
    await expect(page2.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 5_000 })

    await ctx2.close()
  })

  test('4.8 video call connects — both sides show timer, timer increments, video streams active', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const id = uid()
    await register(page, `vidA${id}@test.com`, `vidA${id}`)

    const ctx2 = await browser.newContext({ permissions: ['camera', 'microphone'] })
    const page2 = await ctx2.newPage()
    await register(page2, `vidB${id}@test.com`, `vidB${id}`)

    await sendFriendRequest(page, `vidB${id}`)
    await acceptFirstRequest(page2)

    await openDmWith(page2, `vidA${id}`)
    await openDmWith(page, `vidB${id}`)
    await page.locator('[data-testid="video-call-btn"]').click()

    await expect(page2.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 10_000 })
    await page2.locator('[data-testid="accept-call"]').click()

    // Both sides must reach connected state
    await expect(page.locator('[data-testid="call-timer"]')).toBeVisible({ timeout: 30_000 })
    await expect(page2.locator('[data-testid="call-timer"]')).toBeVisible({ timeout: 15_000 })

    // Timer must increment (connection is alive)
    const t0 = await page.locator('[data-testid="call-timer"]').textContent()
    await page.waitForTimeout(1500)
    const t1 = await page.locator('[data-testid="call-timer"]').textContent()
    expect(t0).not.toEqual(t1)

    // Local video element must have a live srcObject
    const hasLocalStream = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="local-video"]') as HTMLVideoElement | null
      return !!(v?.srcObject)
    })
    expect(hasLocalStream).toBe(true)

    // Remote video element must have a live srcObject (tracks arrived via ontrack)
    const hasRemoteStream = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="remote-video"]') as HTMLVideoElement | null
      return !!(v?.srcObject)
    })
    expect(hasRemoteStream).toBe(true)

    await page.locator('[data-testid="hangup"]').click()
    await expect(page.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 5_000 })
    await expect(page2.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 5_000 })

    await ctx2.close()
  })

  test('4.6 busy — second caller gets no stuck modal when callee is already in a call', async ({ page, browser }) => {
    test.setTimeout(90_000)
    const id = uid()
    await register(page, `busyA${id}@test.com`, `busyA${id}`)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await register(page2, `busyB${id}@test.com`, `busyB${id}`)

    const ctx3 = await browser.newContext()
    const page3 = await ctx3.newPage()
    await register(page3, `busyC${id}@test.com`, `busyC${id}`)

    // A-B friendship
    await sendFriendRequest(page, `busyB${id}`)
    await acceptFirstRequest(page2)
    // A-C friendship
    await page.goto('/contacts')
    await page.locator('input[placeholder="Enter a username"]').fill(`busyC${id}`)
    await page.locator('button:has-text("Send Request")').click()
    await page.waitForTimeout(500)
    await page3.locator('a[href="/contacts"]').click()
    await page3.locator('button:has-text("Accept")').first().click()
    await page3.waitForTimeout(500)

    // Pre-open all DM rooms before any calls start
    await openDmWith(page, `busyB${id}`)           // A opens DM with B
    await openDmWith(page2, `busyA${id}`)           // B opens DM with A (while no call yet)
    await openDmWith(page3, `busyA${id}`)           // C opens DM with A (while no call yet)

    // A calls B — A is now in 'calling' state (callStatus !== 'idle')
    await page.locator('[data-testid="voice-call-btn"]').click()
    await expect(page.locator('[data-testid="call-modal"]')).toBeVisible({ timeout: 5_000 })

    // C calls A — A is busy so should send call_busy back
    // Navigate back to C's DM with A
    await page3.locator(`button:has-text("busyA${id}")`).first().click()
    await expect(page3.locator('textarea[placeholder="Message..."]').first()).toBeVisible({ timeout: 8_000 })
    await page3.locator('[data-testid="voice-call-btn"]').click()
    // C's call-modal should disappear quickly (busy response from A)
    await expect(page3.locator('[data-testid="call-modal"]')).toBeHidden({ timeout: 10_000 })

    await ctx2.close()
    await ctx3.close()
  })
})
