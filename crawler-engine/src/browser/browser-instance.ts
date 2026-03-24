import type { BrowserContext, Browser, Page } from 'playwright'

export class BrowserInstance {
  public readonly context: BrowserContext
  private _browser: Browser | null
  private _pageCount = 0
  private _maxPages: number
  private _retired = false
  private _inUse = false
  private _activePage: Page | null = null
  public proxyUrl?: string

  constructor(context: BrowserContext, browser: Browser | null, maxPages: number) {
    this.context = context
    this._browser = browser
    this._maxPages = maxPages
  }

  get pageCount(): number { return this._pageCount }
  get isRetired(): boolean { return this._retired }
  get inUse(): boolean { return this._inUse }
  get activePage(): Page | null { return this._activePage }

  /**
   * Get or create a page. Reuses a single page per instance (navigate to new URLs).
   */
  async getPage(): Promise<Page> {
    if (!this._activePage || this._activePage.isClosed()) {
      const page = await this.context.newPage()
      this._activePage = page
      this._pageCount++
    }
    return this._activePage
  }

  /**
   * Mark this instance as acquired (in use by a worker)
   */
  acquire(): void {
    this._inUse = true
  }

  /**
   * Release the page after use. Checks retirement threshold.
   */
  release(): void {
    this._inUse = false
    if (this._pageCount >= this._maxPages) {
      this._retired = true
    }
  }

  /**
   * Check if this instance can accept more work
   */
  isAvailable(): boolean {
    return !this._retired && !this._inUse && this._pageCount < this._maxPages
  }

  async close(): Promise<void> {
    this._retired = true
    this._inUse = false
    try {
      if (this._activePage && !this._activePage.isClosed()) {
        await this._activePage.close()
      }
    } catch {}
    try {
      await this.context.close()
    } catch {}
    try {
      if (this._browser) {
        await this._browser.close()
      }
    } catch {}
  }
}
