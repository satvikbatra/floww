/**
 * Watchdog System
 *
 * Background monitors that react to browser events during page processing.
 * Replaces the imperative one-shot pattern (call dismissPopups once) with
 * event-driven monitoring (watch for popups continuously, dismiss when detected).
 *
 * Inspired by browser-use's watchdog architecture.
 */

import type { Page } from 'playwright'
import type { WatchdogEvent } from '../types'
import { dismissPopups } from './popup-dismisser'
import { dismissCookieBanner } from './cookie-banner'
import { handleChallenge } from './challenge-handler'

export type WatchdogHandler = (event: WatchdogEvent) => void | Promise<void>

export type WatchdogName = 'popup' | 'cookie-banner' | 'challenge' | 'dom-change' | 'navigation'

// ── Base class ──────────────────────────────────────────────────

export abstract class Watchdog {
  abstract readonly name: WatchdogName
  protected running = false

  abstract start(page: Page, handler: WatchdogHandler): Promise<void>
  abstract stop(): Promise<void>

  isRunning(): boolean {
    return this.running
  }

  protected emit(handler: WatchdogHandler, type: string, data: Record<string, any> = {}): void {
    handler({
      watchdog: this.name,
      type,
      timestamp: Date.now(),
      data,
    })
  }
}

// ── Watchdog Manager ────────────────────────────────────────────

export class WatchdogManager {
  private watchdogs: Watchdog[]
  private handler: WatchdogHandler
  private events: WatchdogEvent[] = []

  constructor(watchdogNames: WatchdogName[], handler?: WatchdogHandler) {
    this.watchdogs = watchdogNames.map(createWatchdog)
    this.handler = handler ?? ((event) => { this.events.push(event) })

    // Always buffer events internally
    const originalHandler = this.handler
    this.handler = (event) => {
      this.events.push(event)
      originalHandler(event)
    }
  }

  async startAll(page: Page): Promise<void> {
    await Promise.all(
      this.watchdogs.map(w => w.start(page, this.handler).catch(() => {}))
    )
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      this.watchdogs.map(w => w.stop().catch(() => {}))
    )
  }

  getEvents(): WatchdogEvent[] {
    return [...this.events]
  }

  clearEvents(): void {
    this.events = []
  }
}

// ── Concrete Watchdogs ──────────────────────────────────────────

/**
 * Watches for dynamically injected modals/overlays and dismisses them.
 * Uses MutationObserver to detect new modal elements.
 */
class PopupWatchdog extends Watchdog {
  readonly name = 'popup' as const
  private page: Page | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null

  async start(page: Page, handler: WatchdogHandler): Promise<void> {
    this.page = page
    this.running = true

    // Check for popups every 2 seconds
    this.intervalId = setInterval(async () => {
      if (!this.running || !this.page || this.page.isClosed()) {
        if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
        return
      }
      try {
        const dismissed = await dismissPopups(this.page)
        if (dismissed) {
          this.emit(handler, 'popup_dismissed')
        }
      } catch {
        // Page may have navigated — ignore
      }
    }, 2000)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.page = null
  }
}

/**
 * Watches for async CMP (consent management platform) injection and dismisses banners.
 * Many consent platforms load asynchronously after initial page render.
 */
class CookieBannerWatchdog extends Watchdog {
  readonly name = 'cookie-banner' as const
  private page: Page | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private dismissed = false

  async start(page: Page, handler: WatchdogHandler): Promise<void> {
    this.page = page
    this.running = true
    this.dismissed = false

    // Try immediately, then check every 3 seconds for late-loading banners
    try {
      const result = await dismissCookieBanner(page)
      if (result) {
        this.dismissed = true
        this.emit(handler, 'cookie_banner_dismissed', { timing: 'immediate' })
        return
      }
    } catch {}

    this.intervalId = setInterval(async () => {
      if (!this.running || !this.page || this.dismissed) return
      try {
        const result = await dismissCookieBanner(this.page)
        if (result) {
          this.dismissed = true
          this.emit(handler, 'cookie_banner_dismissed', { timing: 'delayed' })
          this.stop()
        }
      } catch {}
    }, 3000)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.page = null
  }
}

/**
 * Watches for security challenges (Cloudflare, DDoS-Guard, etc.) that may
 * appear after initial page load.
 */
class ChallengeWatchdog extends Watchdog {
  readonly name = 'challenge' as const
  private page: Page | null = null
  private checked = false

  async start(page: Page, handler: WatchdogHandler): Promise<void> {
    this.page = page
    this.running = true
    this.checked = false

    // Check once after a short delay (challenges typically appear quickly)
    setTimeout(async () => {
      if (!this.running || !this.page || this.checked) return
      this.checked = true
      try {
        const result = await handleChallenge(this.page, { maxWaitMs: 10000 })
        if (result.detected) {
          this.emit(handler, 'challenge_detected', {
            type: result.type,
            passed: result.passed,
            waitedMs: result.waitedMs,
          })
        }
      } catch {}
    }, 500)
  }

  async stop(): Promise<void> {
    this.running = false
    this.page = null
  }
}

/**
 * Tracks significant DOM mutations to detect dynamic content changes.
 * Useful for SPAs where content updates without navigation.
 */
class DOMChangeWatchdog extends Watchdog {
  readonly name = 'dom-change' as const
  private page: Page | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private cleanupFn: (() => Promise<void>) | null = null

  async start(page: Page, handler: WatchdogHandler): Promise<void> {
    this.page = page
    this.running = true

    // Install MutationObserver via page.evaluate
    await page.evaluate(() => {
      (window as any).__floww_mutations = { count: 0, significantChanges: 0 }
      const observer = new MutationObserver((mutations) => {
        const state = (window as any).__floww_mutations
        state.count += mutations.length
        // Count significant changes (new elements, not just attribute/text changes)
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            state.significantChanges++
          }
        }
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      })
      ;(window as any).__floww_observer = observer
    })

    // Periodically check mutation count and emit events
    this.intervalId = setInterval(async () => {
      if (!this.running || !this.page || this.page.isClosed()) {
        if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
        return
      }
      try {
        const state = await this.page.evaluate(() => {
          const s = (window as any).__floww_mutations
          const result = { count: s.count, significantChanges: s.significantChanges }
          // Reset counters
          s.count = 0
          s.significantChanges = 0
          return result
        })
        if (state.significantChanges > 0) {
          this.emit(handler, 'dom_changed', state)
        }
      } catch {}
    }, 2000)

    this.cleanupFn = async () => {
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
      try {
        await this.page?.evaluate(() => {
          const observer = (window as any).__floww_observer
          if (observer) observer.disconnect()
          delete (window as any).__floww_observer
          delete (window as any).__floww_mutations
        })
      } catch {}
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.cleanupFn) {
      await this.cleanupFn()
      this.cleanupFn = null
    }
    this.page = null
  }
}

/**
 * Monitors for soft navigations (pushState/replaceState) that change the URL
 * without a full page load. Common in SPAs.
 */
class NavigationWatchdog extends Watchdog {
  readonly name = 'navigation' as const
  private page: Page | null = null
  private listener: ((frame: any) => void) | null = null

  async start(page: Page, handler: WatchdogHandler): Promise<void> {
    this.page = page
    this.running = true

    this.listener = (frame: any) => {
      if (!this.running) return
      // Only track main frame navigations
      if (frame === this.page?.mainFrame()) {
        this.emit(handler, 'soft_navigation', { url: frame.url() })
      }
    }

    page.on('framenavigated', this.listener)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.page && this.listener) {
      this.page.removeListener('framenavigated', this.listener)
      this.listener = null
    }
    this.page = null
  }
}

// ── Factory ─────────────────────────────────────────────────────

function createWatchdog(name: WatchdogName): Watchdog {
  switch (name) {
    case 'popup': return new PopupWatchdog()
    case 'cookie-banner': return new CookieBannerWatchdog()
    case 'challenge': return new ChallengeWatchdog()
    case 'dom-change': return new DOMChangeWatchdog()
    case 'navigation': return new NavigationWatchdog()
  }
}
