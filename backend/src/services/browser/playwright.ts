import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'
import { UndetectedBrowser } from './undetected-browser'

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

  /**
   * Create an undetectable persistent context
   * Uses advanced stealth techniques to bypass Google and other bot detection
   */
  async createPersistentContext(options?: {
    userDataDir?: string
    headless?: boolean
  }): Promise<BrowserContext> {
    // Use the new UndetectedBrowser for maximum stealth
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
      userAgent: options?.userAgent || 'Mozilla/5.0 (compatible; FlowwBot/1.0)',
      viewport: options?.viewport || { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    })

    if (options?.cookies) {
      await this.context.addCookies(options.cookies)
    }

    // Add stealth scripts
    await this.context.addInitScript(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      })
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
      await this.context.close()
      this.context = null
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  async navigateAndWait(
    page: Page,
    url: string,
    options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
      timeout?: number
    }
  ) {
    const response = await page.goto(url, {
      waitUntil: options?.waitUntil || 'networkidle',
      timeout: options?.timeout || 30000,
    })

    return response
  }

  async extractPageData(page: Page) {
    return {
      url: page.url(),
      title: await page.title(),
      html: await page.content(),
      
      // Extract links
      links: await page.evaluate(() => {
        const currentUrl = window.location.href.split('#')[0]; // Remove hash from current URL
        return Array.from(document.querySelectorAll('a[href]'))
          .map((a) => {
            const href = (a as HTMLAnchorElement).href;
            const hrefWithoutHash = href.split('#')[0];
            return {
              href: href,
              text: a.textContent?.trim() || '',
              isSamePage: hrefWithoutHash === currentUrl || href === '#' || href.startsWith('#')
            };
          })
          .filter((link) => !link.isSamePage) // Filter out hash-only and same-page links
          .map(({ href, text }) => ({ href, text })); // Remove the helper property
      }),

      // Extract forms
      forms: await page.evaluate(() => {
        return Array.from(document.querySelectorAll('form')).map((form) => ({
          action: form.action,
          method: form.method,
          inputs: Array.from(form.querySelectorAll('input, textarea, select')).map(
            (input) => ({
              name: input.getAttribute('name'),
              type: input.getAttribute('type'),
              required: input.hasAttribute('required'),
            })
          ),
        }))
      }),

      // Extract buttons
      buttons: await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('button, input[type="button"], input[type="submit"]')
        ).map((btn) => ({
          text: btn.textContent?.trim() || '',
          type: btn.getAttribute('type'),
        }))
      }),

      // Meta tags
      meta: await page.evaluate(() => {
        const meta: Record<string, string> = {}
        document.querySelectorAll('meta').forEach((tag) => {
          const name = tag.getAttribute('name') || tag.getAttribute('property')
          const content = tag.getAttribute('content')
          if (name && content) {
            meta[name] = content
          }
        })
        return meta
      }),
    }
  }

  async takeScreenshot(page: Page, path: string, fullPage = true) {
    await page.screenshot({
      path,
      fullPage,
    })
  }
}

// Singleton instance
export const browserService = new BrowserService()
