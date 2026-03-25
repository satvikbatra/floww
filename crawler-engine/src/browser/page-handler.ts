/**
 * Page navigation, SPA detection, and data extraction.
 * Extracted from the original BrowserService — pure functions, no singletons.
 */

import type { Page, Response } from 'playwright'
import type { PageData, ObstacleInfo } from '../types'

/**
 * Navigate to URL with retry logic and SPA content waiting
 */
export async function navigateAndWait(
  page: Page,
  url: string,
  options?: { timeout?: number; retries?: number }
): Promise<Response | null> {
  const maxRetries = options?.retries ?? 2
  const timeout = options?.timeout ?? 30000
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      })
      await waitForSPAContent(page)
      return response
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      }
    }
  }

  throw lastError
}

/**
 * Wait for SPA frameworks to finish rendering (MutationObserver-based)
 */
export async function waitForSPAContent(page: Page, timeoutMs: number = 5000): Promise<void> {
  try {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const bodyText = document.body?.innerText?.trim() || ''
        if (bodyText.length > 100) { resolve(); return }

        let done = false
        const observer = new MutationObserver(() => {
          const text = document.body?.innerText?.trim() || ''
          if (text.length > 50 && !done) {
            done = true
            observer.disconnect()
            resolve()
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        setTimeout(() => { if (!done) { done = true; observer.disconnect(); resolve() } }, 3000)
      })
    })
    await page.waitForTimeout(300)
  } catch {
    // Page may have navigated, not critical
  }
}

/**
 * Extract comprehensive page data from a loaded page
 */
export async function extractPageData(
  page: Page,
  navigationResponse?: Response | null
): Promise<PageData> {
  const startTime = Date.now()
  const finalUrl = page.url()

  // HTTP status from response or heuristic detection
  let httpStatus = navigationResponse?.status() ?? 200
  if (!navigationResponse) {
    httpStatus = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() || ''
      if (text.includes('404') && text.includes('not found')) return 404
      if (text.includes('403') && text.includes('forbidden')) return 403
      if (text.includes('500') && text.includes('server error')) return 500
      return 200
    })
  }

  const title = await page.title()
  const html = await page.content()

  // Detect SPA framework
  const isSPA = await page.evaluate(() => {
    return !!(
      (window as any).__NEXT_DATA__ ||
      (window as any).__NUXT__ ||
      document.querySelector('#__next') ||
      document.querySelector('#app[data-v-app]') ||
      document.querySelector('[ng-version]') ||
      document.querySelector('#root[data-reactroot]') ||
      document.querySelector('script[src*="chunk"]')
    )
  })

  // Extract deduplicated, normalized links
  const links = await page.evaluate(() => {
    const currentUrl = window.location.href.split('#')[0].replace(/\/$/, '')
    const seen = new Set<string>()
    const results: Array<{ href: string; text: string }> = []

    document.querySelectorAll('a[href]').forEach((a) => {
      const el = a as HTMLAnchorElement
      let href = el.href
      if (!href.startsWith('http://') && !href.startsWith('https://')) return
      href = href.split('#')[0].replace(/\/$/, '') || href.split('#')[0]
      if (href === currentUrl || href === currentUrl + '/') return
      if (seen.has(href)) return
      seen.add(href)

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      results.push({ href, text: el.textContent?.trim().substring(0, 200) || '' })
    })
    return results
  })

  // Extract forms
  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).map((form) => ({
      action: form.action || window.location.href,
      method: (form.method || 'GET').toUpperCase(),
      inputs: Array.from(form.querySelectorAll('input, textarea, select')).map((input) => ({
        name: input.getAttribute('name'),
        type: input.getAttribute('type') || input.tagName.toLowerCase(),
        required: input.hasAttribute('required'),
      })),
    }))
  })

  // Extract visible buttons
  const buttons = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')
    )
      .filter(btn => {
        const rect = btn.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map(btn => ({
        text: (btn.textContent?.trim() || (btn as HTMLInputElement).value || '').substring(0, 100),
        type: btn.getAttribute('type'),
      }))
  })

  // Extract meta tags
  const meta = await page.evaluate(() => {
    const meta: Record<string, string> = {}
    document.querySelectorAll('meta').forEach((tag) => {
      const name = tag.getAttribute('name') || tag.getAttribute('property')
      const content = tag.getAttribute('content')
      if (name && content) meta[name] = content
    })
    return meta
  })

  // Extract headings
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .slice(0, 20)
      .map(h => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.textContent?.trim().substring(0, 200) || '',
      }))
      .filter(h => h.text.length > 0)
  })

  return {
    url: finalUrl,
    finalUrl,
    title,
    html,
    httpStatus,
    loadTimeMs: Date.now() - startTime,
    links,
    forms,
    buttons,
    meta,
    headings,
    isSPA,
  }
}

// URL patterns that indicate login/auth pages
const LOGIN_URL_PATTERNS = [
  '/login', '/signin', '/sign-in', '/sign_in',
  '/auth', '/authenticate', '/sso',
  '/account/login', '/user/login', '/users/sign_in',
  '/session/new', '/sessions/new',
]


/**
 * Detect obstacles that might need user interaction
 */
export async function detectObstacle(page: Page, url: string): Promise<ObstacleInfo | null> {
  try {
    const pageTitle = await page.title()
    const currentUrl = page.url().toLowerCase()

    // 1. OAuth/SSO button detection (check before login form — OAuth pages may not have forms)
    const oauthResult = await page.evaluate(() => {
      const oauthSelectors = [
        'a[href*="accounts.google.com"]',
        'a[href*="login.microsoftonline.com"]',
        'a[href*="auth0.com"]',
        'a[href*="login.okta.com"]',
        'a[href*="github.com/login"]',
        'a[href*="appleid.apple.com"]',
        'a[href*="login.salesforce.com"]',
        '[class*="google-sign"]', '[class*="google-login"]', '[class*="google-auth"]',
        '[class*="oauth"]', '[class*="sso"]', '[class*="social-login"]',
        '[data-provider]', '[data-auth-provider]',
      ]

      const oauthTexts = [
        'sign in with google', 'continue with google', 'login with google',
        'sign in with microsoft', 'continue with microsoft',
        'sign in with github', 'continue with github',
        'sign in with sso', 'login with sso', 'single sign-on',
        'sign in with apple', 'continue with apple',
      ]

      // Check for OAuth elements by selector
      const hasOAuthElement = oauthSelectors.some(sel => document.querySelector(sel))

      // Check for OAuth text in buttons and links
      const clickables = document.querySelectorAll('a, button, [role="button"]')
      let hasOAuthText = false
      const providers: string[] = []

      clickables.forEach((el: any) => {
        const text = (el.textContent || '').toLowerCase().trim()
        const href = (el.getAttribute('href') || '').toLowerCase()

        for (const oauthText of oauthTexts) {
          if (text.includes(oauthText)) {
            hasOAuthText = true
            if (oauthText.includes('google')) providers.push('google')
            else if (oauthText.includes('microsoft')) providers.push('microsoft')
            else if (oauthText.includes('github')) providers.push('github')
            else if (oauthText.includes('apple')) providers.push('apple')
            else if (oauthText.includes('sso')) providers.push('sso')
          }
        }

        // Check href for OAuth provider domains
        if (href.includes('accounts.google.com')) providers.push('google')
        else if (href.includes('login.microsoftonline.com')) providers.push('microsoft')
        else if (href.includes('github.com/login')) providers.push('github')
      })

      return {
        detected: hasOAuthElement || hasOAuthText,
        providers: [...new Set(providers)],
      }
    })

    if (oauthResult.detected) {
      return {
        type: 'oauth',
        pageUrl: url,
        pageTitle,
        message: `OAuth/SSO login detected${oauthResult.providers.length > 0 ? ` (${oauthResult.providers.join(', ')})` : ''}. Please sign in using the browser window.`,
        oauthProviders: oauthResult.providers.length > 0 ? oauthResult.providers : undefined,
      }
    }

    // 2. Traditional login form detection (email + password)
    const hasLoginForm = await page.evaluate(() => {
      const pw = document.querySelector('input[type="password"]')
      const email = document.querySelector('input[type="email"], input[name="email"], input[name="username"]')
      return !!(pw && email)
    })
    if (hasLoginForm) {
      return { type: 'login', pageUrl: url, pageTitle, message: 'Login page detected. Please log in.' }
    }

    // 3. Standalone password field + login-like text (step 2 of multi-step login)
    const hasStandaloneLogin = await page.evaluate(() => {
      const pw = document.querySelector('input[type="password"]')
      if (!pw) return false
      const text = document.body?.innerText?.toLowerCase() || ''
      return text.includes('sign in') || text.includes('log in') || text.includes('enter your password')
    })
    if (hasStandaloneLogin) {
      return { type: 'login', pageUrl: url, pageTitle, message: 'Login page detected. Please log in.' }
    }

    // 4. URL-based login page detection (catch login pages without obvious forms)
    const isLoginUrl = LOGIN_URL_PATTERNS.some(pattern => currentUrl.includes(pattern))
    if (isLoginUrl) {
      // Verify page has minimal content (not a full app page that happens to have /auth in URL)
      const isMinimalPage = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href]')
        const internalLinks = Array.from(links).filter(a => {
          const href = a.getAttribute('href') || ''
          return href.startsWith('/') && !href.includes('login') && !href.includes('auth') && !href.includes('signin')
        })
        return internalLinks.length < 5
      })
      if (isMinimalPage) {
        return { type: 'login', pageUrl: url, pageTitle, message: 'Login page detected. Please log in.' }
      }
    }

    // 5. CAPTCHA detection
    const hasCaptcha = await page.evaluate(() => {
      return ['.g-recaptcha', 'iframe[src*="recaptcha"]', 'iframe[src*="captcha"]', '[class*="captcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="challenge"]']
        .some(p => document.querySelector(p))
    })
    if (hasCaptcha) {
      return { type: 'captcha', pageUrl: url, pageTitle, message: 'CAPTCHA detected.' }
    }

    // 6. Access denied detection
    const isBlocked = await page.evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() || ''
      return text.length < 2000 && (text.includes('access denied') || text.includes('forbidden') || text.includes('unauthorized'))
    })
    if (isBlocked) {
      return { type: 'blocked', pageUrl: url, pageTitle, message: 'Access denied. Authentication may be required.' }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Take a screenshot with full-page fallback
 */
export async function takeScreenshot(page: Page): Promise<Buffer> {
  try {
    return await page.screenshot({ fullPage: true, timeout: 15000 })
  } catch {
    try {
      return await page.screenshot({ fullPage: false, timeout: 10000 })
    } catch {
      return Buffer.from([])
    }
  }
}
