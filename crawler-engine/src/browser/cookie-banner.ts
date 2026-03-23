/**
 * Cookie Banner Auto-Dismiss — Detects and clicks "Accept" on cookie consent banners
 *
 * Covers: GDPR banners, CookieBot, OneTrust, Quantcast, TrustArc, custom banners
 */

import type { Page } from 'playwright'

// Selectors for common cookie accept buttons (ordered by specificity)
const ACCEPT_SELECTORS = [
  // Specific consent platforms
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[data-cookiefirst-action="accept"]',
  '.cc-accept', '.cc-allow', '.cc-btn.cc-dismiss',
  '#cookie-accept', '#accept-cookies', '#acceptCookies',
  '#consent-accept', '#consent_accept',
  '.cookie-consent-accept', '.cookie-accept-btn',
  '[data-testid="cookie-accept"]', '[data-testid="accept-cookies"]',

  // Generic patterns — text-based
  'button[aria-label*="accept" i]',
  'button[aria-label*="agree" i]',
  'button[aria-label*="consent" i]',
  'a[aria-label*="accept" i]',

  // Class-based patterns
  '[class*="cookie"] button[class*="accept" i]',
  '[class*="cookie"] button[class*="agree" i]',
  '[class*="consent"] button[class*="accept" i]',
  '[class*="gdpr"] button[class*="accept" i]',
  '[id*="cookie"] button[class*="accept" i]',

  // Broader patterns (less specific, try last)
  '[class*="cookie-banner"] button:first-of-type',
  '[class*="cookie-consent"] button:first-of-type',
  '[id*="cookie-banner"] button:first-of-type',
]

// Selectors for the banner container (to check if one exists)
const BANNER_SELECTORS = [
  '#onetrust-banner-sdk',
  '#CybotCookiebotDialog',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[class*="cookie-notice"]',
  '[class*="gdpr"]',
  '[id*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '[id*="cookieConsent"]',
  '[data-testid*="cookie"]',
  '[aria-label*="cookie" i]',
  '[role="dialog"][class*="consent" i]',
]

/**
 * Try to dismiss cookie consent banner.
 * Returns true if a banner was found and dismissed.
 */
export async function dismissCookieBanner(page: Page): Promise<boolean> {
  try {
    // First check if any banner exists
    const hasBanner = await page.evaluate((selectors) => {
      return selectors.some(s => document.querySelector(s) !== null)
    }, BANNER_SELECTORS)

    if (!hasBanner) return false

    // Try to click accept button using predefined selectors
    for (const selector of ACCEPT_SELECTORS) {
      try {
        const el = page.locator(selector).first()
        const count = await el.count()
        if (count > 0 && await el.isVisible()) {
          await el.click({ timeout: 2000 })
          await page.waitForTimeout(500)
          return true
        }
      } catch {
        continue
      }
    }

    // Fallback: find buttons with accept/agree/allow text
    const dismissed = await page.evaluate(() => {
      const keywords = ['accept', 'agree', 'allow', 'ok', 'got it', 'i understand', 'accept all', 'allow all']
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="cookie"] a, [class*="consent"] a'))

      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || ''
        if (keywords.some(kw => text === kw || text.startsWith(kw))) {
          const rect = btn.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            (btn as HTMLElement).click()
            return true
          }
        }
      }
      return false
    })

    if (dismissed) {
      await page.waitForTimeout(500)
      return true
    }

    // Last resort: press Escape to dismiss modal-style banners
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    return false
  } catch {
    return false
  }
}
