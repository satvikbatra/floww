/**
 * Undetected Browser - Makes Playwright undetectable by Google and other bot detection systems
 * 
 * Based on undetected-chromedriver and puppeteer-extra-plugin-stealth
 * 
 * Note: TypeScript errors in addInitScript callbacks are expected - that code runs in browser context
 */

import { chromium, type BrowserContext } from 'playwright'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

export class UndetectedBrowser {
  /**
   * Create an undetectable persistent browser context
   */
  static async launch(options?: {
    userDataDir?: string
    headless?: boolean
  }): Promise<BrowserContext> {
    // Use dedicated Floww profile
    const homeDir = os.homedir()
    const userDataDir = options?.userDataDir || path.join(homeDir, '.floww', 'browser-profile')

    // Ensure directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true })
      console.log(`\n📁 Created browser profile at: ${userDataDir}`)
    }

    console.log(`🔐 Launching undetected browser...`)
    console.log(`   Profile: ${userDataDir}`)

    // Launch with maximum stealth
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: options?.headless ?? false,
      channel: 'chrome', // Use actual Chrome, not Chromium
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      
      // Comprehensive args to avoid all detection
      args: [
        // Anti-detection
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-web-security',
        
        // Stability
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        
        // Remove automation flags
        '--disable-blink-features',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        
        // Reduce detection surface
        '--no-first-run',
        '--no-default-browser-check',
        '--no-service-autorun',
        '--password-store=basic',
        
        // Disable unnecessary features
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-extensions',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        
        // Misc
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--use-mock-keychain',
        '--mute-audio',
      ],
    })

    // Apply comprehensive stealth patches
    await this.applyStealthPatches(context)

    console.log(`✅ Undetected browser ready!\n`)
    return context
  }

  /**
   * Apply comprehensive stealth JavaScript patches
   * Note: Code inside addInitScript runs in browser context, not Node.js
   */
  private static async applyStealthPatches(context: BrowserContext): Promise<void> {
    // Patch 1: Remove webdriver property
    await context.addInitScript(() => {
      // @ts-ignore - runs in browser context
      delete Object.getPrototypeOf(navigator).webdriver
      // @ts-ignore
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      })
    })

    // Patch 2: Chrome runtime
    await context.addInitScript(() => {
      // @ts-ignore - browser context
      window.chrome = {
        app: {
          isInstalled: false,
          InstallState: {
            DISABLED: 'disabled',
            INSTALLED: 'installed',
            NOT_INSTALLED: 'not_installed',
          },
          RunningState: {
            CANNOT_RUN: 'cannot_run',
            READY_TO_RUN: 'ready_to_run',
            RUNNING: 'running',
          },
        },
        runtime: {
          OnInstalledReason: {
            CHROME_UPDATE: 'chrome_update',
            INSTALL: 'install',
            SHARED_MODULE_UPDATE: 'shared_module_update',
            UPDATE: 'update',
          },
          OnRestartRequiredReason: {
            APP_UPDATE: 'app_update',
            OS_UPDATE: 'os_update',
            PERIODIC: 'periodic',
          },
          PlatformArch: {
            ARM: 'arm',
            ARM64: 'arm64',
            MIPS: 'mips',
            MIPS64: 'mips64',
            X86_32: 'x86-32',
            X86_64: 'x86-64',
          },
          PlatformNaclArch: {
            ARM: 'arm',
            MIPS: 'mips',
            MIPS64: 'mips64',
            X86_32: 'x86-32',
            X86_64: 'x86-64',
          },
          PlatformOs: {
            ANDROID: 'android',
            CROS: 'cros',
            LINUX: 'linux',
            MAC: 'mac',
            OPENBSD: 'openbsd',
            WIN: 'win',
          },
          RequestUpdateCheckStatus: {
            NO_UPDATE: 'no_update',
            THROTTLED: 'throttled',
            UPDATE_AVAILABLE: 'update_available',
          },
        },
        csi: () => {},
        loadTimes: () => {},
      }
    })

    // Patch 3: Permissions
    await context.addInitScript(() => {
      const originalQuery = window.navigator.permissions.query
      // @ts-ignore
      window.navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission,
            // @ts-ignore
            onchange: null,
          })
        }
        return originalQuery(parameters)
      }
    })

    // Patch 4: Plugins
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            {
              0: {
                type: 'application/x-google-chrome-pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
                enabledPlugin: Plugin,
              },
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer',
              length: 1,
              name: 'Chrome PDF Plugin',
            },
            {
              0: {
                type: 'application/pdf',
                suffixes: 'pdf',
                description: '',
                enabledPlugin: Plugin,
              },
              description: '',
              filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
              length: 1,
              name: 'Chrome PDF Viewer',
            },
            {
              0: {
                type: 'application/x-nacl',
                suffixes: '',
                description: 'Native Client Executable',
                enabledPlugin: Plugin,
              },
              1: {
                type: 'application/x-pnacl',
                suffixes: '',
                description: 'Portable Native Client Executable',
                enabledPlugin: Plugin,
              },
              description: '',
              filename: 'internal-nacl-plugin',
              length: 2,
              name: 'Native Client',
            },
          ]
          return plugins
        },
      })
    })

    // Patch 5: Languages
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      })
    })

    // Patch 6: Hardware concurrency
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      })
    })

    // Patch 7: Device memory
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      })
    })

    // Patch 8: Battery API
    await context.addInitScript(() => {
      // @ts-ignore
      if (navigator.getBattery) {
        // @ts-ignore
        navigator.getBattery = () => {
          return Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          })
        }
      }
    })

    // Patch 9: Remove automation-related properties
    await context.addInitScript(() => {
      // Remove callPhantom
      // @ts-ignore
      if (window.callPhantom) {
        // @ts-ignore
        delete window.callPhantom
      }
      // @ts-ignore
      if (window._phantom) {
        // @ts-ignore
        delete window._phantom
      }
      // @ts-ignore
      if (window.__nightmare) {
        // @ts-ignore
        delete window.__nightmare
      }
    })

    // Patch 10: User agent data
    await context.addInitScript(() => {
      // @ts-ignore
      if (navigator.userAgentData) {
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

    // Patch 11: Media devices
    await context.addInitScript(() => {
      if (navigator.mediaDevices) {
        const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices
        navigator.mediaDevices.enumerateDevices = function () {
          return originalEnumerateDevices.call(this).then((devices) => {
            return devices.map((device) => ({
              deviceId: device.deviceId,
              kind: device.kind,
              label: device.label,
              groupId: device.groupId,
              toJSON: () => ({}),
            }))
          })
        }
      }
    })

    // Patch 12: WebGL vendor
    await context.addInitScript(() => {
      const getParameter = WebGLRenderingContext.prototype.getParameter
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.'
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine'
        }
        return getParameter.call(this, parameter)
      }
    })

    // Patch 13: Canvas fingerprinting
    await context.addInitScript(() => {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
      HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
        if (type === 'image/png' && this.width === 280 && this.height === 60) {
          // Likely fingerprinting attempt
          const canvas = document.createElement('canvas')
          canvas.width = this.width
          canvas.height = this.height
          return canvas.toDataURL(type)
        }
        return originalToDataURL.apply(this, [type] as any)
      }
    })

    // Patch 14: Connection type
    await context.addInitScript(() => {
      // @ts-ignore
      if (navigator.connection) {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
          }),
        })
      }
    })
  }
}
