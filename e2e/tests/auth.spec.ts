import { test, expect } from '@playwright/test'
import { uid, register, login, logout } from '../helpers/auth'

test.describe('2.1 Authentication', () => {
  test('register creates account and shows username in sidebar', async ({ page }) => {
    const id = uid()
    await register(page, `user${id}@test.com`, `user${id}`)
    await expect(page).toHaveURL('/')
    // Username shown in sidebar user-status bar
    await expect(page.locator(`text=user${id}`).first()).toBeVisible()
  })

  test('duplicate email is rejected with an error message', async ({ page }) => {
    const id = uid()
    const email = `dup${id}@test.com`
    await register(page, email, `first${id}`)
    await logout(page)

    // Try registering again with same email
    await page.goto('/register')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="text"]').fill(`second${id}`)
    await page.locator('input[type="password"]').nth(0).fill('Password123!')
    await page.locator('input[type="password"]').nth(1).fill('Password123!')
    await page.click('button[type="submit"]')
    await expect(page.locator('p.text-red-400, [class*="red"]').first()).toBeVisible({ timeout: 6_000 })
  })

  test('duplicate username is rejected', async ({ page }) => {
    const id = uid()
    await register(page, `ua${id}@test.com`, `uname${id}`)
    await logout(page)

    await page.goto('/register')
    await page.locator('input[type="email"]').fill(`ub${id}@test.com`)
    await page.locator('input[type="text"]').fill(`uname${id}`)  // same username
    await page.locator('input[type="password"]').nth(0).fill('Password123!')
    await page.locator('input[type="password"]').nth(1).fill('Password123!')
    await page.click('button[type="submit"]')
    await expect(page.locator('p.text-red-400, [class*="red"]').first()).toBeVisible({ timeout: 6_000 })
  })

  test('login with valid credentials lands on main layout', async ({ page }) => {
    const id = uid()
    const email = `login${id}@test.com`
    await register(page, email, `loginuser${id}`)
    await logout(page)
    await login(page, email)
    await expect(page).toHaveURL('/')
    await expect(page.locator(`text=loginuser${id}`).first()).toBeVisible()
  })

  test('login with wrong password shows error', async ({ page }) => {
    const id = uid()
    const email = `badpw${id}@test.com`
    await register(page, email, `badpw${id}`)
    await logout(page)

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill('WrongPassword!')
    await page.click('button[type="submit"]')
    await expect(page.locator('p.text-red-400, [class*="red"]').first()).toBeVisible({ timeout: 6_000 })
    await expect(page).not.toHaveURL('/')
  })

  test('logout ends session — redirects to login', async ({ page }) => {
    const id = uid()
    await register(page, `logout${id}@test.com`, `logout${id}`)
    await logout(page)
    await expect(page).toHaveURL('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('2.1.3 persistent login — session survives page reload', async ({ page }) => {
    const id = uid()
    await register(page, `persist${id}@test.com`, `persist${id}`)
    await page.reload()
    await expect(page).toHaveURL('/')
    await expect(page.locator(`text=persist${id}`).first()).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login', { timeout: 5_000 })
  })
})
