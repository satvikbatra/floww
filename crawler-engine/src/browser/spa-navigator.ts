/**
 * SPA Navigator — Discovers routes in Single Page Applications
 *
 * SPAs don't use <a href> links. This module:
 * 1. Finds clickable elements (buttons, divs with role="button", data-route, etc.)
 * 2. Clicks them one by one
 * 3. Monitors URL changes after each click
 * 4. Returns newly discovered routes
 * 5. Extracts routes from JS bundles and framework configs
 */

import type { Page } from 'playwright'

export interface DiscoveredRoute {
  url: string
  discoveredBy: 'click' | 'data-attr' | 'js-bundle' | 'aria' | 'hash'
  triggerSelector?: string
  triggerText?: string
}

/**
 * Discover SPA routes by inspecting the DOM for navigation-like elements
 * This is NON-destructive — it doesn't click anything, just extracts URLs from attributes
 */
export async function discoverRoutesFromDOM(page: Page): Promise<DiscoveredRoute[]> {
  return await page.evaluate(() => {
    const routes: Array<{ url: string; discoveredBy: string; triggerSelector?: string; triggerText?: string }> = []
    const seen = new Set<string>()
    const origin = window.location.origin

    function addRoute(url: string, by: string, selector?: string, text?: string) {
      // Resolve relative URLs
      try {
        const resolved = new URL(url, window.location.href).toString()
        if (!resolved.startsWith('http')) return
        if (seen.has(resolved)) return
        seen.add(resolved)
        routes.push({ url: resolved, discoveredBy: by, triggerSelector: selector, triggerText: text })
      } catch {}
    }

    // 1. Data attributes that might contain routes
    const routeAttrs = ['data-route', 'data-href', 'data-url', 'data-link', 'data-navigate-to', 'data-to', 'data-path']
    for (const attr of routeAttrs) {
      document.querySelectorAll(`[${attr}]`).forEach(el => {
        const val = el.getAttribute(attr)
        if (val) addRoute(val, 'data-attr', `[${attr}="${val}"]`, el.textContent?.trim().substring(0, 100))
      })
    }

    // 2. ARIA link elements
    document.querySelectorAll('[role="link"]').forEach(el => {
      // Check for any URL-like attribute
      for (const attr of Array.from(el.attributes)) {
        if (attr.value.startsWith('/') || attr.value.startsWith('http')) {
          addRoute(attr.value, 'aria', `[role="link"]`, el.textContent?.trim().substring(0, 100))
        }
      }
    })

    // 3. Next.js Link components (render as <a> but also have data-* attrs)
    document.querySelectorAll('a[data-nbs]').forEach(el => {
      const href = (el as HTMLAnchorElement).href
      if (href) addRoute(href, 'data-attr', 'a[data-nbs]', el.textContent?.trim().substring(0, 100))
    })

    // 4. Extract from window.__NEXT_DATA__ (Next.js)
    try {
      const nextData = (window as any).__NEXT_DATA__
      if (nextData?.props?.pageProps?.routes) {
        for (const route of nextData.props.pageProps.routes) {
          if (typeof route === 'string') addRoute(route, 'js-bundle')
          else if (route?.path) addRoute(route.path, 'js-bundle')
        }
      }
      // Extract from build manifest
      if (nextData?.buildId) {
        // Next.js pages are at /_next/data/{buildId}/*.json — but we want page routes
        // Check __BUILD_MANIFEST if available
        const manifest = (window as any).__BUILD_MANIFEST
        if (manifest) {
          for (const key of Object.keys(manifest)) {
            if (key.startsWith('/') && key !== '/_app' && key !== '/_error') {
              addRoute(origin + key, 'js-bundle')
            }
          }
        }
      }
    } catch {}

    // 5. Extract from Vue Router if available
    try {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      const router = app?.config?.globalProperties?.$router
      if (router?.options?.routes) {
        for (const route of router.options.routes) {
          if (route.path && !route.path.includes(':')) {
            addRoute(origin + route.path, 'js-bundle')
          }
          // Check children routes
          if (route.children) {
            for (const child of route.children) {
              if (child.path && !child.path.includes(':')) {
                addRoute(origin + route.path + '/' + child.path, 'js-bundle')
              }
            }
          }
        }
      }
    } catch {}

    // 6. Extract from Angular Router if available
    try {
      const ngRouter = (window as any).ng?.getComponent?.(document.querySelector('[ng-version]'))?.router
      if (ngRouter?.config) {
        for (const route of ngRouter.config) {
          if (route.path && !route.path.includes(':')) {
            addRoute(origin + '/' + route.path, 'js-bundle')
          }
        }
      }
    } catch {}

    // 7. Hash routes (for older SPAs)
    document.querySelectorAll('a[href^="#/"], a[href^="#!/"]').forEach(el => {
      const href = (el as HTMLAnchorElement).getAttribute('href')
      if (href) {
        addRoute(origin + '/' + href, 'hash', `a[href="${href}"]`, el.textContent?.trim().substring(0, 100))
      }
    })

    return routes
  }) as DiscoveredRoute[]
}

/**
 * Discover routes by clicking interactive elements and monitoring URL changes.
 * DESTRUCTIVE — may change page state. Call after extractPageData.
 */
export async function discoverRoutesByClicking(
  page: Page,
  options?: { maxClicks?: number; timeout?: number }
): Promise<DiscoveredRoute[]> {
  const maxClicks = options?.maxClicks ?? 20
  const timeout = options?.timeout ?? 3000
  const routes: DiscoveredRoute[] = []
  const startUrl = page.url()
  const seen = new Set<string>([startUrl])

  // Find clickable navigation elements
  const clickTargets = await page.evaluate(() => {
    const targets: Array<{ selector: string; text: string }> = []
    const navKeywords = /nav|menu|sidebar|header|tab|link/i

    // Buttons that look like navigation
    document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="tab"]').forEach((el, i) => {
      const text = el.textContent?.trim() || ''
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      if (text.length === 0 || text.length > 50) return

      // Skip non-navigation buttons (submit, close, etc.)
      const lowerText = text.toLowerCase()
      if (/submit|save|cancel|close|delete|remove|ok|confirm|accept|reject|dismiss/i.test(lowerText)) return

      // Prefer buttons inside nav-like containers
      const parent = el.closest('nav, [role="navigation"], [class*="nav"], [class*="menu"], [class*="sidebar"]')
      const priority = parent ? 0 : 1

      const id = el.id ? `#${el.id}` : ''
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''
      const selector = id || `${el.tagName.toLowerCase()}${cls}:nth-of-type(${i + 1})`

      targets.push({ selector, text })
    })

    // Clickable divs/spans with pointer cursor (common in SPAs)
    document.querySelectorAll('[style*="cursor: pointer"], [style*="cursor:pointer"]').forEach((el, i) => {
      const text = el.textContent?.trim() || ''
      if (text.length === 0 || text.length > 50) return
      if (el.tagName === 'A' || el.tagName === 'BUTTON') return // already handled

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const selector = `[style*="cursor"][data-floww-click="${i}"]`
      el.setAttribute('data-floww-click', String(i))
      targets.push({ selector, text })
    })

    return targets.slice(0, 30) // cap at 30 candidates
  })

  // Click each target, monitor for URL changes
  for (const target of clickTargets.slice(0, maxClicks)) {
    try {
      const beforeUrl = page.url()

      // Click the element
      const el = page.locator(target.selector).first()
      const count = await el.count()
      if (count === 0) continue

      await el.click({ timeout: 2000 })

      // Wait briefly for navigation
      await page.waitForTimeout(timeout)

      const afterUrl = page.url()

      if (afterUrl !== beforeUrl && !seen.has(afterUrl)) {
        seen.add(afterUrl)
        routes.push({
          url: afterUrl,
          discoveredBy: 'click',
          triggerSelector: target.selector,
          triggerText: target.text,
        })
      }

      // Go back to original page to try next click
      if (afterUrl !== startUrl) {
        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})
        await page.waitForTimeout(500)
      }
    } catch {
      // Click failed, skip this target
    }
  }

  return routes
}

/**
 * Auto-scroll page to trigger lazy loading
 */
export async function scrollToLoadContent(page: Page, options?: {
  maxScrolls?: number
  scrollDelay?: number
}): Promise<void> {
  const maxScrolls = options?.maxScrolls ?? 5
  const scrollDelay = options?.scrollDelay ?? 800

  try {
    for (let i = 0; i < maxScrolls; i++) {
      const previousHeight = await page.evaluate(() => document.body.scrollHeight)

      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })

      await page.waitForTimeout(scrollDelay)

      const newHeight = await page.evaluate(() => document.body.scrollHeight)

      // No new content loaded — stop scrolling
      if (newHeight === previousHeight) break
    }

    // Scroll back to top for screenshot
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
  } catch {
    // Scrolling failed, not critical
  }
}
