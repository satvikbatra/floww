/**
 * Session Guard — Detects when authentication expires mid-crawl
 * and signals that re-authentication is needed.
 *
 * Checks for: 401/403 responses, redirects to login pages,
 * disappearing auth indicators.
 */

import type { Page, Response } from 'playwright'

export interface SessionStatus {
  isValid: boolean
  reason?: 'http_401' | 'http_403' | 'login_redirect' | 'auth_indicator_missing' | 'session_cookie_missing'
  redirectUrl?: string
}

// URL patterns that indicate login/auth pages
const LOGIN_URL_PATTERNS = [
  '/login', '/signin', '/sign-in', '/sign_in',
  '/auth', '/authenticate', '/sso',
  '/account/login', '/user/login', '/users/sign_in',
  '/session/new', '/sessions/new',
  'accounts.google.com', 'login.microsoftonline.com',
  'auth0.com/login', 'login.okta.com',
]

// Elements that indicate the user IS logged in
const AUTH_INDICATORS = [
  '[class*="logout"]', '[class*="sign-out"]', '[class*="signout"]',
  'a[href*="logout"]', 'a[href*="signout"]', 'a[href*="sign-out"]',
  'button:has-text("Log out")', 'button:has-text("Sign out")',
  '[class*="user-menu"]', '[class*="user-avatar"]',
  '[class*="profile-menu"]', '[class*="account-menu"]',
  '[data-testid*="user"]', '[data-testid*="avatar"]',
]

/**
 * Check if the current session is still valid after a navigation
 */
export async function checkSessionStatus(
  page: Page,
  response: Response | null,
  options?: { knownLoginUrls?: string[]; knownAuthCookies?: string[] }
): Promise<SessionStatus> {
  // 1. Check HTTP status
  const status = response?.status() ?? 200
  if (status === 401) {
    return { isValid: false, reason: 'http_401' }
  }
  if (status === 403) {
    return { isValid: false, reason: 'http_403' }
  }

  // 2. Check if we were redirected to a login page
  const currentUrl = page.url().toLowerCase()
  const allLoginPatterns = [...LOGIN_URL_PATTERNS, ...(options?.knownLoginUrls || [])]

  for (const pattern of allLoginPatterns) {
    if (currentUrl.includes(pattern.toLowerCase())) {
      return { isValid: false, reason: 'login_redirect', redirectUrl: page.url() }
    }
  }

  // 3. Check for login form on current page (might have been redirected without URL change)
  const hasLoginForm = await page.evaluate(() => {
    const pw = document.querySelector('input[type="password"]')
    const email = document.querySelector('input[type="email"], input[name="email"], input[name="username"]')
    const body = document.body?.innerText?.toLowerCase() || ''
    const isLoginPage = body.includes('sign in') || body.includes('log in') || body.includes('login')
    return !!(pw && email && isLoginPage)
  })

  if (hasLoginForm) {
    return { isValid: false, reason: 'login_redirect', redirectUrl: page.url() }
  }

  // 4. Check if known session cookies are still present
  if (options?.knownAuthCookies && options.knownAuthCookies.length > 0) {
    const cookies = await page.context().cookies()
    const cookieNames = new Set(cookies.map(c => c.name))
    const missingCookie = options.knownAuthCookies.find(name => !cookieNames.has(name))
    if (missingCookie) {
      return { isValid: false, reason: 'session_cookie_missing' }
    }
  }

  return { isValid: true }
}

/**
 * Detect which cookies are likely auth/session cookies
 * Call this right after successful login to learn what to watch for
 */
export async function detectAuthCookies(page: Page): Promise<string[]> {
  const cookies = await page.context().cookies()
  const authKeywords = ['session', 'auth', 'token', 'jwt', 'sid', 'login', 'user', 'access']

  return cookies
    .filter(c => {
      const lowerName = c.name.toLowerCase()
      return authKeywords.some(kw => lowerName.includes(kw))
    })
    .map(c => c.name)
}

/**
 * Save all cookies from current session for later restoration
 */
export async function saveCookies(page: Page): Promise<any[]> {
  return await page.context().cookies()
}

/**
 * Restore cookies to a browser context
 */
export async function restoreCookies(page: Page, cookies: any[]): Promise<void> {
  if (cookies.length > 0) {
    await page.context().addCookies(cookies)
  }
}
