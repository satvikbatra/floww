/**
 * Stealth Browser Configuration - Enterprise-grade anti-detection
 * 
 * Evades bot detection similar to how Cursor, Anthropic, and other AI agents
 * handle browser automation in production.
 */

import { BrowserContext, Page } from 'playwright';

export interface StealthConfig {
  // Browser fingerprint randomization
  randomizeViewport?: boolean;
  randomizeUserAgent?: boolean;
  randomizeLocale?: boolean;

  // Detection evasion
  blockDetectionApi?: boolean;
  patchWebdriver?: boolean;
  removeAutomationFlags?: boolean;

  // Human-like behavior
  humanMouseMovement?: boolean;
  humanScrolling?: boolean;
  randomDelays?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;

  // Rate limiting
  requestsPerMinute?: number;
  concurrentTabs?: number;

  // Advanced evasion
  useProxy?: boolean;
  proxyUrl?: string;
  rotateSession?: boolean;
  sessionDurationMinutes?: number;
}

export class SessionRotationNeeded extends Error {
  constructor() {
    super('Browser session should be rotated');
    this.name = 'SessionRotationNeeded';
  }
}

/**
 * StealthBrowser - Makes automation indistinguishable from human browsing
 */
export class StealthBrowser {
  private config: Required<StealthConfig>;
  private lastRequestTime: Date | null = null;
  private requestCount = 0;
  private sessionStart = new Date();

  // Realistic user agents
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  ];

  // Realistic locales
  private static readonly LOCALES = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9',
    'en-US,en;q=0.9,es;q=0.8',
    'en-US,en;q=0.9,fr;q=0.8',
    'en-CA,en-US,en;q=0.9',
    'en-AU,en-US,en;q=0.9',
  ];

  // Common resolutions
  private static readonly VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ];

  constructor(config?: StealthConfig) {
    this.config = {
      randomizeViewport: true,
      randomizeUserAgent: true,
      randomizeLocale: true,
      blockDetectionApi: true,
      patchWebdriver: true,
      removeAutomationFlags: true,
      humanMouseMovement: true,
      humanScrolling: true,
      randomDelays: true,
      minDelayMs: 100,
      maxDelayMs: 500,
      requestsPerMinute: 30,
      concurrentTabs: 3,
      useProxy: false,
      proxyUrl: '',
      rotateSession: false,
      sessionDurationMinutes: 30,
      ...config,
    };
  }

  getRandomUserAgent(): string {
    return StealthBrowser.USER_AGENTS[
      Math.floor(Math.random() * StealthBrowser.USER_AGENTS.length)
    ];
  }

  getRandomLocale(): string {
    return StealthBrowser.LOCALES[Math.floor(Math.random() * StealthBrowser.LOCALES.length)];
  }

  getRandomViewport(): { width: number; height: number } {
    return StealthBrowser.VIEWPORTS[Math.floor(Math.random() * StealthBrowser.VIEWPORTS.length)];
  }

  /**
   * Apply all stealth measures to a browser context
   */
  async applyStealth(context: BrowserContext): Promise<void> {
    // 1. Patch webdriver detection
    if (this.config.patchWebdriver) {
      await context.addInitScript(this.webdriverPatch);
    }

    // 2. Remove automation flags
    if (this.config.removeAutomationFlags) {
      await context.addInitScript(this.automationPatch);
    }

    // 3. Block detection APIs
    if (this.config.blockDetectionApi) {
      await context.addInitScript(this.detectionApiPatch);
    }

    // 4. Add noise to plugins
    await context.addInitScript(this.pluginsPatch);

    // 5. Randomize permissions
    await context.addInitScript(this.permissionsPatch);

    // 6. Override geolocation
    await context.addInitScript(this.geolocationPatch);
  }

  /**
   * Get browser context options with stealth settings
   */
  getContextOptions(): Record<string, any> {
    const options: Record<string, any> = {
      viewport: this.config.randomizeViewport
        ? this.getRandomViewport()
        : { width: 1920, height: 1080 },
      userAgent: this.config.randomizeUserAgent ? this.getRandomUserAgent() : undefined,
      locale: this.config.randomizeLocale ? this.getRandomLocale().split(',')[0] : 'en-US',
      timezoneId: ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London'][
        Math.floor(Math.random() * 4)
      ],
      permissions: ['geolocation', 'notifications'],
      extraHTTPHeaders: {
        'Accept-Language': this.config.randomizeLocale ? this.getRandomLocale() : 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    };

    // Remove undefined values
    return Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined));
  }

  /**
   * Apply rate limiting between requests
   */
  async rateLimit(): Promise<void> {
    // Check if we need to rotate session
    if (this.config.rotateSession) {
      const sessionDuration = Date.now() - this.sessionStart.getTime();
      if (sessionDuration > this.config.sessionDurationMinutes * 60 * 1000) {
        this.sessionStart = new Date();
        throw new SessionRotationNeeded();
      }
    }

    // Rate limiting
    if (this.lastRequestTime) {
      const elapsed = (Date.now() - this.lastRequestTime.getTime()) / 1000;
      const minInterval = 60.0 / this.config.requestsPerMinute;

      if (elapsed < minInterval) {
        const waitTime = (minInterval - elapsed + Math.random() * 0.5) * 1000;
        await this.sleep(waitTime);
      }
    }

    this.lastRequestTime = new Date();
    this.requestCount++;
  }

  /**
   * Scroll like a human - not smooth, not predictable
   */
  async humanScroll(page: Page): Promise<void> {
    if (!this.config.humanScrolling) return;

    const height = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    if (height <= viewportHeight) return;

    const scrollCount = Math.floor(Math.random() * 6) + 3; // 3-8 scrolls
    let currentPos = 0;

    for (let i = 0; i < scrollCount; i++) {
      // Random scroll amount
      const scrollAmount = Math.floor(Math.random() * viewportHeight) + 100;
      let newPos = Math.min(currentPos + scrollAmount, height - viewportHeight);

      // Sometimes go back up
      if (Math.random() < 0.2) {
        newPos = Math.max(0, currentPos - Math.floor(Math.random() * 150) - 50);
      }

      await page.evaluate((pos) => window.scrollTo(0, pos), newPos);
      currentPos = newPos;

      // Random delay between scrolls
      await this.sleep(Math.random() * 900 + 300); // 300-1200ms
    }
  }

  /**
   * Move mouse like a human - with curves and pauses
   */
  async humanMouseMove(page: Page, targetSelector?: string): Promise<void> {
    if (!this.config.humanMouseMovement) return;

    const viewport = page.viewportSize();
    if (!viewport) return;

    // Start from random position
    const startX = Math.floor(Math.random() * (viewport.width - 100)) + 50;
    const startY = Math.floor(Math.random() * (viewport.height - 100)) + 50;

    // Move to random end position
    const endX = Math.floor(Math.random() * (viewport.width - 200)) + 100;
    const endY = Math.floor(Math.random() * (viewport.height - 200)) + 100;

    // Create bezier curve points for natural movement
    const steps = Math.floor(Math.random() * 13) + 8; // 8-20 steps

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Add randomness to the curve
      const x = startX + (endX - startX) * t + Math.floor(Math.random() * 21) - 10;
      const y = startY + (endY - startY) * t + Math.floor(Math.random() * 21) - 10;

      await page.mouse.move(x, y);
      await this.sleep(Math.random() * 20 + 10); // 10-30ms
    }

    // Random pause after movement
    await this.sleep(Math.random() * 200 + 100); // 100-300ms
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // JavaScript patches for stealth
  private readonly webdriverPatch = `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  `;

  private readonly automationPatch = `
    // Remove automation flags
    window.navigator.chrome = {
      runtime: {}
    };

    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // Add chrome runtime
    window.chrome = window.chrome || {
      runtime: {}
    };
  `;

  private readonly detectionApiPatch = `
    // Block detection APIs
    if (window.callPhantom) {
      window.callPhantom = function() {};
    }

    // Override stack trace detection
    const originalStackGetter = Object.getOwnPropertyDescriptor(Error.prototype, 'stack').get;
    Object.defineProperty(Error.prototype, 'stack', {
      get: function() {
        return originalStackGetter.call(this).replace(/\\n.*playwright.*/g, '');
      }
    });

    // Block performance.timing modifications
    if (window.performance) {
      const originalTiming = window.performance.timing;
      Object.defineProperty(window.performance, 'timing', {
        get: () => originalTiming
      });
    }
  `;

  private readonly pluginsPatch = `
    // Add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(i => ({
        name: 'Plugin ' + i,
        description: 'Plugin description ' + i,
        filename: 'plugin' + i + '.dll'
      })),
      configurable: false
    });

    // Add realistic languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: false
    });
  `;

  private readonly permissionsPatch = `
    // Randomize permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: 'prompt' });
      }
      return originalQuery(parameters);
    };
  `;

  private readonly geolocationPatch = `
    // Override geolocation
    if (navigator.geolocation) {
      const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
      navigator.geolocation.getCurrentPosition = function(success, error, options) {
        // Return random location near major cities
        const locations = [
          { coords: { latitude: 40.7128, longitude: -74.0060, accuracy: 100 } }, // NYC
          { coords: { latitude: 34.0522, longitude: -118.2437, accuracy: 100 } }, // LA
          { coords: { latitude: 41.8781, longitude: -87.6298, accuracy: 100 } }, // Chicago
        ];
        success(locations[Math.floor(Math.random() * locations.length)]);
      };
    }
  `;
}
