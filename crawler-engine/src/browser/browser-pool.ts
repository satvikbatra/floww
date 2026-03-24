import { chromium } from 'playwright'
import { BrowserInstance } from './browser-instance'
import { StealthBrowserLauncher } from './stealth'
import type { CrawlerConfig } from '../config'
import type { ProxyRotator } from '../proxy/proxy-rotator'

export class BrowserPool {
  private instances: BrowserInstance[] = []
  private config: CrawlerConfig
  private waitQueue: Array<(instance: BrowserInstance) => void> = []
  private proxyRotator: ProxyRotator | null = null

  constructor(config: CrawlerConfig, proxyRotator?: ProxyRotator) {
    this.config = config
    this.proxyRotator = proxyRotator ?? null
  }

  /**
   * Acquire an available browser instance. Waits if all are busy.
   */
  async acquire(): Promise<BrowserInstance> {
    // Find available instance
    const available = this.instances.find(i => i.isAvailable())
    if (available) {
      available.acquire()
      return available
    }

    // Clean up retired instances
    await this.cleanRetired()

    // Check if we can launch a new one
    if (this.instances.length < this.config.maxBrowsers) {
      const instance = await this.launchNew()
      instance.acquire()
      return instance
    }

    // All instances busy and at max capacity — wait for one to be released
    return new Promise<BrowserInstance>((resolve) => {
      this.waitQueue.push(resolve)
    })
  }

  /**
   * Release a browser instance after use
   */
  release(instance: BrowserInstance): void {
    instance.release()

    // If instance is retired, clean it up later
    if (instance.isRetired) {
      // Don't resolve waiters with a retired instance — let them get a new one
      if (this.waitQueue.length > 0) {
        this.launchNew().then(newInstance => {
          newInstance.acquire()
          const waiter = this.waitQueue.shift()
          if (waiter) waiter(newInstance)
        }).catch(() => {
          // If launch fails, try to resolve with any available instance
          const avail = this.instances.find(i => i.isAvailable())
          if (avail) {
            avail.acquire()
            const waiter = this.waitQueue.shift()
            if (waiter) waiter(avail)
          }
        })
      }
      return
    }

    // Resolve a waiting acquirer if any
    if (this.waitQueue.length > 0 && instance.isAvailable()) {
      instance.acquire()
      const waiter = this.waitQueue.shift()!
      waiter(instance)
    }
  }

  /**
   * Release with error — marks proxy as failed if proxy rotation is active
   */
  releaseWithError(instance: BrowserInstance): void {
    if (this.proxyRotator && instance.proxyUrl) {
      this.proxyRotator.markFailed(instance.proxyUrl)
    }
    this.release(instance)
  }

  /**
   * Close all browser instances
   */
  async closeAll(): Promise<void> {
    // Reject all waiters
    for (const waiter of this.waitQueue) {
      // Resolve with a dummy that will fail — caller should handle
    }
    this.waitQueue = []
    await Promise.all(this.instances.map(i => i.close()))
    this.instances = []
  }

  get activeCount(): number {
    return this.instances.filter(i => !i.isRetired).length
  }

  get totalPages(): number {
    return this.instances.reduce((sum, i) => sum + i.pageCount, 0)
  }

  private async launchNew(): Promise<BrowserInstance> {
    // Determine proxy
    const proxyUrl = this.getProxyForLaunch()
    const proxyConfig = proxyUrl ? { server: proxyUrl } : undefined

    if (this.config.usePersistentProfile) {
      const context = await StealthBrowserLauncher.launch({
        headless: this.config.headless,
        userDataDir: this.config.userDataDir,
        proxyUrl,
      })
      const instance = new BrowserInstance(context, null, this.config.maxPagesPerBrowser)
      instance.proxyUrl = proxyUrl
      this.instances.push(instance)
      return instance
    }

    if (this.config.useStealth) {
      const { browser, context } = await StealthBrowserLauncher.launchFresh({
        headless: this.config.headless,
        userAgent: this.config.userAgent,
        proxyUrl,
      })
      const instance = new BrowserInstance(context, browser, this.config.maxPagesPerBrowser)
      instance.proxyUrl = proxyUrl
      this.instances.push(instance)
      return instance
    }

    // Plain browser
    const browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
      proxy: proxyConfig,
    })
    const context = await browser.newContext({
      userAgent: this.config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    })
    const instance = new BrowserInstance(context, browser, this.config.maxPagesPerBrowser)
    instance.proxyUrl = proxyUrl
    this.instances.push(instance)
    return instance
  }

  private getProxyForLaunch(): string | undefined {
    if (this.proxyRotator) {
      const proxy = this.proxyRotator.getNext()
      return proxy?.url
    }
    return this.config.proxyUrl
  }

  private async cleanRetired(): Promise<void> {
    const retired = this.instances.filter(i => i.isRetired)
    await Promise.all(retired.map(i => i.close()))
    this.instances = this.instances.filter(i => !i.isRetired)
  }
}
