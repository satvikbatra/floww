/**
 * Enhanced Content Extractor — Handles edge cases in content extraction
 *
 * - Shadow DOM traversal
 * - iframe content extraction
 * - Hash route detection
 * - Canonical URL detection
 * - hreflang (multi-language) detection
 */

import type { Page } from 'playwright'

/**
 * Extract content from Shadow DOM elements
 */
export async function extractShadowDOMContent(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const contents: string[] = []

    function traverseShadowRoots(root: Document | ShadowRoot, depth: number = 0) {
      if (depth > 5) return // prevent infinite recursion

      const elements = root.querySelectorAll('*')
      for (const el of Array.from(elements)) {
        if (el.shadowRoot) {
          const shadowText = el.shadowRoot.textContent?.trim()
          if (shadowText && shadowText.length > 20) {
            contents.push(shadowText.substring(0, 1000))
          }
          traverseShadowRoots(el.shadowRoot, depth + 1)
        }
      }
    }

    traverseShadowRoots(document)
    return contents
  })
}

/**
 * Extract links from iframes (same-origin only)
 */
export async function extractIframeLinks(page: Page): Promise<Array<{ href: string; text: string }>> {
  const links: Array<{ href: string; text: string }> = []

  try {
    const frames = page.frames()
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue

      try {
        const frameUrl = frame.url()
        // Skip cross-origin frames and about:blank
        if (frameUrl === 'about:blank' || frameUrl === '') continue

        const frameLinks = await frame.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => ({
              href: (a as HTMLAnchorElement).href,
              text: a.textContent?.trim().substring(0, 200) || '',
            }))
            .filter(l => l.href.startsWith('http'))
        }).catch(() => [])

        links.push(...frameLinks)
      } catch {
        // Cross-origin or detached frame, skip
      }
    }
  } catch {
    // Frame access failed
  }

  return links
}

/**
 * Detect hash-based routes that represent different pages
 */
export async function detectHashRoutes(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const routes: string[] = []
    const origin = window.location.origin
    const pathname = window.location.pathname

    // Find hash links that look like routes (not just anchors)
    document.querySelectorAll('a[href^="#/"], a[href^="#!/"]').forEach(el => {
      const href = el.getAttribute('href')
      if (href && (href.startsWith('#/') || href.startsWith('#!/'))) {
        routes.push(origin + pathname + href)
      }
    })

    // Also check for history.pushState in scripts (indication of SPA routing)
    const scripts = document.querySelectorAll('script:not([src])')
    for (const script of Array.from(scripts)) {
      const text = script.textContent || ''
      // Look for route definitions
      const routeMatches = text.match(/['"]\/[a-z][a-z0-9-/]*['"]/gi)
      if (routeMatches) {
        for (const match of routeMatches) {
          const route = match.replace(/['"]/g, '')
          if (route.length > 1 && route.length < 100 && !route.includes(' ')) {
            routes.push(origin + route)
          }
        }
      }
    }

    return [...new Set(routes)]
  })
}

/**
 * Extract canonical URL from the page
 */
export async function extractCanonicalUrl(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const canonical = document.querySelector('link[rel="canonical"]')
    if (canonical) {
      const href = canonical.getAttribute('href')
      if (href) {
        try { return new URL(href, window.location.href).toString() } catch { return null }
      }
    }
    return null
  })
}

/**
 * Detect hreflang alternatives (multi-language pages)
 * Returns URLs of alternate language versions to avoid crawling duplicates
 */
export async function detectHreflangUrls(page: Page): Promise<Array<{ lang: string; url: string }>> {
  return await page.evaluate(() => {
    const alternates: Array<{ lang: string; url: string }> = []
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => {
      const lang = el.getAttribute('hreflang')
      const href = el.getAttribute('href')
      if (lang && href) {
        try {
          alternates.push({ lang, url: new URL(href, window.location.href).toString() })
        } catch {}
      }
    })
    return alternates
  })
}

/**
 * Detect pagination on the page and return next/prev page URLs
 */
export async function detectPagination(page: Page): Promise<{
  nextUrl?: string
  prevUrl?: string
  totalPages?: number
  currentPage?: number
}> {
  return await page.evaluate(() => {
    const result: { nextUrl?: string; prevUrl?: string; totalPages?: number; currentPage?: number } = {}

    // link[rel="next"] / link[rel="prev"]
    const nextLink = document.querySelector('link[rel="next"]')
    const prevLink = document.querySelector('link[rel="prev"]')
    if (nextLink) result.nextUrl = (nextLink as HTMLLinkElement).href
    if (prevLink) result.prevUrl = (prevLink as HTMLLinkElement).href

    // Common pagination selectors
    const nextSelectors = [
      'a[rel="next"]', '[class*="next"] a', '[class*="pagination"] a:last-child',
      'a[aria-label*="next" i]', 'a[aria-label*="Next"]',
      '[class*="page-next"] a', '.pagination .next a',
    ]
    const prevSelectors = [
      'a[rel="prev"]', '[class*="prev"] a', '[class*="pagination"] a:first-child',
      'a[aria-label*="prev" i]', 'a[aria-label*="Previous"]',
    ]

    if (!result.nextUrl) {
      for (const sel of nextSelectors) {
        const el = document.querySelector(sel) as HTMLAnchorElement
        if (el?.href) { result.nextUrl = el.href; break }
      }
    }
    if (!result.prevUrl) {
      for (const sel of prevSelectors) {
        const el = document.querySelector(sel) as HTMLAnchorElement
        if (el?.href) { result.prevUrl = el.href; break }
      }
    }

    // Try to detect current page number
    const activePageEl = document.querySelector('[class*="pagination"] .active, [class*="pagination"] [aria-current="page"]')
    if (activePageEl) {
      const num = parseInt(activePageEl.textContent?.trim() || '')
      if (!isNaN(num)) result.currentPage = num
    }

    return result
  })
}
