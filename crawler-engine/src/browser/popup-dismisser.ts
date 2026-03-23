/**
 * Popup/Modal Auto-Dismiss — Closes blocking overlays, modals, and popups
 *
 * Handles: newsletter popups, promo modals, survey popups, notification prompts,
 * exit-intent popups, bottom bars, chat widgets
 */

import type { Page } from 'playwright'

// Selectors for close buttons inside modals/popups
const CLOSE_SELECTORS = [
  // Common close button patterns
  '[class*="modal"] [class*="close"]',
  '[class*="modal"] button[aria-label*="close" i]',
  '[class*="popup"] [class*="close"]',
  '[class*="popup"] button[aria-label*="close" i]',
  '[class*="overlay"] [class*="close"]',
  '[class*="dialog"] [class*="close"]',
  '[role="dialog"] button[aria-label*="close" i]',
  '[role="dialog"] [class*="close"]',

  // X buttons
  'button[aria-label="Close"]',
  'button[aria-label="Dismiss"]',
  '[class*="dismiss"]',
  '[data-dismiss="modal"]',
  '[data-close]',
  '.close-button', '.close-btn', '.modal-close',

  // Chat widgets
  '[class*="intercom"] [class*="close"]',
  '[class*="crisp"] [class*="close"]',
  '[class*="drift"] [class*="close"]',
  '[class*="tawk"] [class*="close"]',
  '#hubspot-messages-iframe-container [class*="close"]',
]

// Selectors for blocking overlays/modals themselves
const MODAL_SELECTORS = [
  '[class*="modal"][style*="display: block"]',
  '[class*="modal"][style*="display:block"]',
  '[class*="modal"].show',
  '[class*="modal"].active',
  '[class*="modal"].visible',
  '[class*="popup"][style*="display: block"]',
  '[class*="popup"].show',
  '[class*="popup"].active',
  '[class*="overlay"][style*="display: block"]',
  '[class*="overlay"].show',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
]

/**
 * Dismiss any blocking popups/modals on the page.
 * Returns true if something was dismissed.
 */
export async function dismissPopups(page: Page): Promise<boolean> {
  let dismissed = false

  try {
    // 1. Try clicking close buttons
    for (const selector of CLOSE_SELECTORS) {
      try {
        const el = page.locator(selector).first()
        if (await el.count() > 0 && await el.isVisible({ timeout: 500 })) {
          await el.click({ timeout: 1000 })
          dismissed = true
          await page.waitForTimeout(300)
          break
        }
      } catch {
        continue
      }
    }

    // 2. Try Escape key
    if (!dismissed) {
      const hasModal = await page.evaluate((selectors) => {
        return selectors.some(s => {
          const el = document.querySelector(s)
          return el && (el as HTMLElement).offsetParent !== null
        })
      }, MODAL_SELECTORS)

      if (hasModal) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        dismissed = true
      }
    }

    // 3. Try clicking backdrop overlay to dismiss
    if (!dismissed) {
      dismissed = await page.evaluate(() => {
        const overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"]')
        for (const overlay of Array.from(overlays)) {
          const style = window.getComputedStyle(overlay)
          if (style.position === 'fixed' && style.zIndex && parseInt(style.zIndex) > 100) {
            (overlay as HTMLElement).click()
            return true
          }
        }
        return false
      })

      if (dismissed) await page.waitForTimeout(300)
    }

    // 4. Force-remove blocking elements via JS
    await page.evaluate(() => {
      // Remove fixed-position full-screen overlays
      const allElements = document.querySelectorAll('*')
      for (const el of Array.from(allElements)) {
        const style = window.getComputedStyle(el)
        if (
          style.position === 'fixed' &&
          style.zIndex &&
          parseInt(style.zIndex) > 999 &&
          el.tagName !== 'NAV' &&
          el.tagName !== 'HEADER'
        ) {
          const rect = el.getBoundingClientRect()
          // If it covers > 50% of viewport, it's a blocking overlay
          if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.3) {
            (el as HTMLElement).style.display = 'none'
          }
        }
      }

      // Also remove body scroll lock (common with modals)
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden')
    })

    return dismissed
  } catch {
    return false
  }
}
