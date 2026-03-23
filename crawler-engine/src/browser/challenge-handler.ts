/**
 * Challenge Handler — Detects and waits for browser challenges
 *
 * Handles: Cloudflare "Checking your browser", JavaScript challenges,
 * DDoS-Guard, Sucuri, Akamai bot detection waiting pages.
 */

import type { Page } from 'playwright'

export interface ChallengeResult {
  detected: boolean
  type?: 'cloudflare' | 'ddos-guard' | 'sucuri' | 'akamai' | 'generic'
  passed: boolean
  waitedMs: number
}

// Patterns that indicate a challenge page
const CHALLENGE_PATTERNS = [
  { selector: '#cf-challenge-running', type: 'cloudflare' as const },
  { selector: '#challenge-running', type: 'cloudflare' as const },
  { selector: '#challenge-form', type: 'cloudflare' as const },
  { selector: 'iframe[src*="challenges.cloudflare.com"]', type: 'cloudflare' as const },
  { selector: '[class*="cf-browser-verification"]', type: 'cloudflare' as const },
  { selector: '#ddos-guard', type: 'ddos-guard' as const },
  { selector: '[class*="ddos"]', type: 'ddos-guard' as const },
  { selector: '[class*="sucuri"]', type: 'sucuri' as const },
  { selector: '#akamai-challenge', type: 'akamai' as const },
]

// Text patterns in page body
const CHALLENGE_TEXT_PATTERNS = [
  { text: 'checking your browser', type: 'cloudflare' as const },
  { text: 'just a moment', type: 'cloudflare' as const },
  { text: 'verify you are human', type: 'cloudflare' as const },
  { text: 'please wait while we verify', type: 'generic' as const },
  { text: 'ddos protection by', type: 'ddos-guard' as const },
  { text: 'access denied - sucuri', type: 'sucuri' as const },
]

/**
 * Detect if current page is a challenge/verification page and wait for it to pass.
 * Returns after challenge completes or timeout.
 */
export async function handleChallenge(
  page: Page,
  options?: { maxWaitMs?: number; checkIntervalMs?: number }
): Promise<ChallengeResult> {
  const maxWait = options?.maxWaitMs ?? 30000
  const checkInterval = options?.checkIntervalMs ?? 1000
  const startTime = Date.now()

  // Check for challenge by selector
  let challengeType: ChallengeResult['type'] = undefined

  for (const pattern of CHALLENGE_PATTERNS) {
    try {
      const count = await page.locator(pattern.selector).count()
      if (count > 0) {
        challengeType = pattern.type
        break
      }
    } catch {
      continue
    }
  }

  // Check by text content if no selector matched
  if (!challengeType) {
    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.toLowerCase().substring(0, 1000) || ''
    )

    for (const pattern of CHALLENGE_TEXT_PATTERNS) {
      if (bodyText.includes(pattern.text)) {
        challengeType = pattern.type
        break
      }
    }
  }

  if (!challengeType) {
    return { detected: false, passed: true, waitedMs: 0 }
  }

  // Challenge detected — wait for it to pass
  console.log(`  Challenge detected: ${challengeType}. Waiting...`)

  while (Date.now() - startTime < maxWait) {
    await page.waitForTimeout(checkInterval)

    // Check if challenge is gone
    let stillChallenged = false

    for (const pattern of CHALLENGE_PATTERNS) {
      try {
        const count = await page.locator(pattern.selector).count()
        if (count > 0) {
          stillChallenged = true
          break
        }
      } catch {
        continue
      }
    }

    if (!stillChallenged) {
      // Double-check by text
      const bodyText = await page.evaluate(() =>
        document.body?.innerText?.toLowerCase().substring(0, 1000) || ''
      )

      const textMatch = CHALLENGE_TEXT_PATTERNS.some(p => bodyText.includes(p.text))
      if (!textMatch) {
        const waitedMs = Date.now() - startTime
        console.log(`  Challenge passed in ${waitedMs}ms`)
        return { detected: true, type: challengeType, passed: true, waitedMs }
      }
    }
  }

  // Timeout — challenge didn't pass
  const waitedMs = Date.now() - startTime
  console.log(`  Challenge timeout after ${waitedMs}ms`)
  return { detected: true, type: challengeType, passed: false, waitedMs }
}

/**
 * Check for meta refresh redirects: <meta http-equiv="refresh" content="5;url=...">
 */
export async function handleMetaRefresh(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="refresh"]')
    if (!meta) return null

    const content = meta.getAttribute('content') || ''
    const urlMatch = content.match(/url=(.+)/i)
    if (urlMatch) {
      try {
        return new URL(urlMatch[1].trim(), window.location.href).toString()
      } catch {
        return null
      }
    }
    return null
  })
}

/**
 * Detect JavaScript-based redirects that happen after page load
 * Call this after page load to catch `window.location.href = ...` redirects
 */
export async function waitForJsRedirect(
  page: Page,
  timeoutMs: number = 3000
): Promise<boolean> {
  const startUrl = page.url()

  try {
    await page.waitForURL((url) => url.toString() !== startUrl, { timeout: timeoutMs })
    return true // URL changed — redirect happened
  } catch {
    return false // No redirect within timeout
  }
}
