/**
 * CDP Session Manager
 *
 * Lazily creates and caches Chrome DevTools Protocol sessions for Playwright pages.
 * Uses a WeakMap so sessions are garbage-collected when pages are disposed.
 */

import type { Page, CDPSession } from 'playwright'

const sessionCache = new WeakMap<Page, CDPSession>()

/**
 * Get or create a CDP session for a Playwright page.
 * The session is cached and reused across calls for the same page.
 */
export async function getCDPSession(page: Page): Promise<CDPSession> {
  const cached = sessionCache.get(page)
  if (cached) return cached

  const context = page.context()

  // Verify Chromium — CDP is not available on Firefox/WebKit
  if (!context.newCDPSession) {
    throw new Error(
      'CDP sessions require Chromium. Firefox and WebKit are not supported for enriched DOM features.'
    )
  }

  const session = await context.newCDPSession(page)
  sessionCache.set(page, session)
  return session
}

/**
 * Detach and remove the cached CDP session for a page.
 * Safe to call even if no session exists.
 */
export async function disposeCDPSession(page: Page): Promise<void> {
  const session = sessionCache.get(page)
  if (!session) return

  try {
    await session.detach()
  } catch {
    // Page may already be closed — swallow
  }
  sessionCache.delete(page)
}
