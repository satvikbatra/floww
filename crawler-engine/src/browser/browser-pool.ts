import { chromium } from 'playwright'
import { BrowserInstance } from './browser-instance'
import { StealthBrowserLauncher } from './stealth'
import type { CrawlerConfig } from '../config'

export class BrowserPool {
  private instances: BrowserInstance[] = []
  private config: CrawlerConfig
  private launching = false

  constructor(config: CrawlerConfig) {
    this.config = config
  }

  /**
   * Acquire an available browser instance. Launches new one if needed.
   */
  async acquire(): Promise<BrowserInstance> {
    // Find available instance
    const available = this.instances.find(i => i.isAvailable())
    if (available) return available

    // Clean up retired instances
    await this.cleanRetired()

    // Check if we can launch a new one
    if (this.instances.length >= this.config.maxBrowsers) {
      // Wait for one to become available (shouldn't happen with concurrency <= browsers)
      const active = this.instances.find(i => !i.isRetired)
      if (active) return active
      // Force close oldest and launch fresh
      await this.instances[0]?.close()
      this.instances.shift()
    }

    // Launch new browser
    return await this.launchNew()
  }

  /**
   * Release a browser instance after use
   */
  release(instance: BrowserInstance): void {
    instance.release()
  }

  /**
   * Close all browser instances
   */
  async closeAll(): Promise<void> {
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
    if (this.config.usePersistentProfile) {
      const context = await StealthBrowserLauncher.launch({
        headless: this.config.headless,
        userDataDir: this.config.userDataDir,
      })
      const instance = new BrowserInstance(context, null, this.config.maxPagesPerBrowser)
      this.instances.push(instance)
      return instance
    }

    if (this.config.useStealth) {
      const { browser, context } = await StealthBrowserLauncher.launchFresh({
        headless: this.config.headless,
        userAgent: this.config.userAgent,
      })
      const instance = new BrowserInstance(context, browser, this.config.maxPagesPerBrowser)
      this.instances.push(instance)
      return instance
    }

    // Plain browser
    const browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
    })
    const context = await browser.newContext({
      userAgent: this.config.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    })
    const instance = new BrowserInstance(context, browser, this.config.maxPagesPerBrowser)
    this.instances.push(instance)
    return instance
  }

  private async cleanRetired(): Promise<void> {
    const retired = this.instances.filter(i => i.isRetired)
    await Promise.all(retired.map(i => i.close()))
    this.instances = this.instances.filter(i => !i.isRetired)
  }
}
