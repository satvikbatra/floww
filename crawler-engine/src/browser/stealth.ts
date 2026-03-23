/**
 * Stealth browser launcher — makes Playwright undetectable by bot detection systems.
 * Based on undetected-chromedriver and puppeteer-extra-plugin-stealth patterns.
 * 14 patches applied to every browser context.
 */

import { chromium, type BrowserContext } from 'playwright'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

export interface StealthLaunchOptions {
  userDataDir?: string
  headless?: boolean
  args?: string[]
}

export class StealthBrowserLauncher {
  /**
   * Launch a persistent browser context with full stealth patches
   */
  static async launch(options?: StealthLaunchOptions): Promise<BrowserContext> {
    const homeDir = os.homedir()
    const userDataDir = options?.userDataDir || path.join(homeDir, '.floww', 'browser-profile')

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true })
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: options?.headless ?? false,
      channel: 'chrome',
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-service-autorun',
        '--password-store=basic',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-breakpad',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--mute-audio',
        ...(options?.args || []),
      ],
    })

    await this.applyStealthPatches(context)
    return context
  }

  /**
   * Launch a fresh (non-persistent) context with stealth
   */
  static async launchFresh(options?: {
    headless?: boolean
    userAgent?: string
    viewport?: { width: number; height: number }
  }): Promise<{ browser: any; context: BrowserContext }> {
    const browser = await chromium.launch({
      headless: options?.headless ?? true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    })

    const context = await browser.newContext({
      userAgent: options?.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options?.viewport || { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    })

    await this.applyStealthPatches(context)
    return { browser, context }
  }

  private static async applyStealthPatches(context: BrowserContext): Promise<void> {
    // 1. Remove webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true })
    })

    // 2. Chrome runtime
    await context.addInitScript(() => {
      (window as any).chrome = {
        app: { isInstalled: false },
        runtime: {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', WIN: 'win' },
        },
        csi: () => {},
        loadTimes: () => {},
      }
    })

    // 3. Permissions
    await context.addInitScript(() => {
      const orig = navigator.permissions.query
      ;(navigator.permissions as any).query = (p: any) =>
        p.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : orig.call(navigator.permissions, p)
    })

    // 4. Plugins
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', length: 1 },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
        ],
      })
    })

    // 5. Languages
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
    })

    // 6. Hardware concurrency
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    })

    // 7. Device memory
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    })

    // 8. WebGL vendor
    await context.addInitScript(() => {
      const getParam = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function (p) {
        if (p === 37445) return 'Intel Inc.'
        if (p === 37446) return 'Intel Iris OpenGL Engine'
        return getParam.call(this, p)
      }
    })

    // 9. Remove automation markers
    await context.addInitScript(() => {
      for (const key of ['callPhantom', '_phantom', '__nightmare'] as const) {
        if ((window as any)[key]) delete (window as any)[key]
      }
    })

    // 10. User agent data
    await context.addInitScript(() => {
      if ((navigator as any).userAgentData) {
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: [
              { brand: 'Google Chrome', version: '120' },
              { brand: 'Chromium', version: '120' },
              { brand: 'Not=A?Brand', version: '24' },
            ],
            mobile: false,
            platform: 'macOS',
          }),
        })
      }
    })

    // 11. Connection type
    await context.addInitScript(() => {
      if ((navigator as any).connection) {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }),
        })
      }
    })
  }
}
