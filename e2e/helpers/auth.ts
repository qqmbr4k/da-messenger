import { Page } from '@playwright/test'

/** Unique suffix so each test run uses fresh credentials */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * Register a new user and log them in.
 * The app redirects to /login after registration, so we follow up with a login.
 */
export async function register(page: Page, email: string, username: string, password = 'Password123!') {
  await page.goto('/register')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="text"]').fill(username)
  const pwFields = page.locator('input[type="password"]')
  await pwFields.nth(0).fill(password)
  await pwFields.nth(1).fill(password)
  await page.click('button[type="submit"]')
  // Registration redirects to /login
  await page.waitForURL('/login', { timeout: 10_000 })
  // Now log in
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

export async function login(page: Page, email: string, password = 'Password123!') {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 10_000 })
}

export async function logout(page: Page) {
  // Use the API directly for reliability — same as clicking Sign Out
  await page.request.post('/api/auth/logout')
  await page.goto('/login')
  await page.waitForURL('/login', { timeout: 8_000 })
}
