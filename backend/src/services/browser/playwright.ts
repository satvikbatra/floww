import { chromium, type Browser, type Page, type BrowserContext, type Response } from 'playwright'
import { UndetectedBrowser } from './undetected-browser'

export interface PageData {
  url: string
  finalUrl: string // after redirects
  title: string
  html: string
  httpStatus: number
  loadTimeMs: number
  links: Array<{ href: string; text: string }>
  forms: Array<{ action: string; method: string; inputs: Array<{ name: string | null; type: string | null; required: boolean }> }>
  buttons: Array<{ text: string; type: string | null }>
  meta: Record<string, string>
  headings: Array<{ level: number; text: string }>
  isSPA: boolean
}

export class BrowserService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  async launch(headless: boolean = true) {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      })
    }
    return this.browser
  }

  async createPersistentContext(options?: {
    userDataDir?: string
    headless?: boolean
  }): Promise<BrowserContext> {
    this.context = await UndetectedBrowser.launch({
      userDataDir: options?.userDataDir,
      headless: options?.headless ?? false,
    })
    return this.context
  }

  async createContext(options?: {
    userAgent?: string
    viewport?: { width: number; height: number }
    cookies?: any[]
    headless?: boolean
  }) {
    const browser = await this.launch(options?.headless ?? true)

    this.context = await browser.newContext({
      userAgent: options?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options?.viewport || { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    })

    if (options?.cookies) {
      await this.context.addCookies(options.cookies)
    }

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })

    return this.context
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      await this.createContext()
    }
    return this.context!.newPage()
  }

  async close() {
    if (this.context) {
      try { await this.context.close() } catch {}
      this.context = null
    }
    if (this.browser) {
      try { await this.browser.close() } catch {}
      this.browser = null
    }
  }

  /**
   * Navigate to URL with retry logic and SPA detection
   */
  async navigateAndWait(
    page: Page,
    url: string,
    options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
      timeout?: number
      retries?: number
    }
  ): Promise<Response | null> {
    const maxRetries = options?.retries ?? 2
    const timeout = options?.timeout ?? 30000
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await page.goto(url, {
          waitUntil: options?.waitUntil || 'networkidle',
          timeout,
        })

        // Wait for SPA content to render
        await this.waitForSPAContent(page)

        return response
      } catch (error) {
        lastError = error as Error
        if (attempt < maxRetries) {
          console.log(`   Retry ${attempt + 1}/${maxRetries} for ${url}: ${lastError.message}`)
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
    }

    throw lastError
  }

  /**
   * Wait for SPA frameworks to finish rendering
   */
  private async waitForSPAContent(page: Page, timeoutMs: number = 5000): Promise<void> {
    try {
      // Check if page uses common SPA frameworks and wait for their render
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          // If page already has content, resolve immediately
          const bodyText = document.body?.innerText?.trim() || ''
          if (bodyText.length > 100) {
            resolve()
            return
          }

          // Otherwise wait for mutations (SPA rendering)
          let resolved = false
          const observer = new MutationObserver(() => {
            const text = document.body?.innerText?.trim() || ''
            if (text.length > 50 && !resolved) {
              resolved = true
              observer.disconnect()
              resolve()
            }
          })

          observer.observe(document.body, {
            childList: true,
            subtree: true,
          })

          // Timeout fallback
          setTimeout(() => {
            if (!resolved) {
              resolved = true
              observer.disconnect()
              resolve()
            }
          }, 3000)
        })
      })

      // Small extra wait for any final renders
      await page.waitForTimeout(500)
    } catch {
      // Page might have navigated, not critical
    }
  }

  /**
   * Extract comprehensive page data
   */
  async extractPageData(page: Page, navigationResponse?: Response | null): Promise<PageData> {
    const startTime = Date.now()
    const finalUrl = page.url()

    // Get HTTP status from navigation response, or detect from page
    let httpStatus = navigationResponse?.status() ?? 200
    if (!navigationResponse) {
      // Try to detect error pages
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

    // Detect SPA
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

    // Extract links — deduplicated, normalized, with more metadata
    const links = await page.evaluate(() => {
      const currentOrigin = window.location.origin
      const currentUrl = window.location.href.split('#')[0]
      const seen = new Set<string>()
      const results: Array<{ href: string; text: string }> = []

      document.querySelectorAll('a[href]').forEach((a) => {
        const el = a as HTMLAnchorElement
        let href = el.href

        // Skip non-http, javascript:, mailto:, tel:, etc
        if (!href.startsWith('http://') && !href.startsWith('https://')) return

        // Normalize: remove trailing slash, strip fragment
        href = href.split('#')[0].replace(/\/$/, '') || href.split('#')[0]

        // Skip same-page links
        if (href === currentUrl || href === currentUrl + '/') return

        // Deduplicate
        if (seen.has(href)) return
        seen.add(href)

        const text = el.textContent?.trim().substring(0, 200) || ''
        // Skip invisible links
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return

        results.push({ href, text })
      })

      return results
    })

    // Extract forms with full input metadata
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

    // Extract buttons
    const buttons = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')
      )
        .filter((btn) => {
          const rect = btn.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        .map((btn) => ({
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
        if (name && content) {
          meta[name] = content
        }
      })
      return meta
    })

    // Extract headings for page structure understanding
    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .slice(0, 20)
        .map((h) => ({
          level: parseInt(h.tagName.substring(1)),
          text: h.textContent?.trim().substring(0, 200) || '',
        }))
        .filter(h => h.text.length > 0)
    })

    const loadTimeMs = Date.now() - startTime

    return {
      url: finalUrl,
      finalUrl,
      title,
      html,
      httpStatus,
      loadTimeMs,
      links,
      forms,
      buttons,
      meta,
      headings,
      isSPA,
    }
  }

  async takeScreenshot(page: Page, filePath: string, fullPage = true) {
    try {
      await page.screenshot({
        path: filePath,
        fullPage,
        timeout: 15000,
      })
    } catch (error) {
      // If full page fails (too large), try viewport only
      if (fullPage) {
        console.warn(`Full page screenshot failed, trying viewport only`)
        await page.screenshot({
          path: filePath,
          fullPage: false,
          timeout: 10000,
        })
      } else {
        throw error
      }
    }
  }
}

export const browserService = new BrowserService()
