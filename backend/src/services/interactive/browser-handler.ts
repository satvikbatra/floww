/**
 * Browser-Based Interactive Handler
 *
 * Injects a floating UI panel directly into the crawler's page when
 * an obstacle is detected (login, captcha, etc.). No second tab.
 *
 * The crawler's page is passed in per-request — we don't own a page,
 * we just inject UI into whatever page the crawler is currently on.
 */

import type { Page } from 'playwright'
import { EventEmitter } from 'events'

export enum InteractionType {
  LOGIN_FORM = 'login_form',
  OAUTH_LOGIN = 'oauth_login',
  REQUIRED_FORM = 'required_form',
  CAPTCHA = 'captcha',
  TWO_FACTOR = 'two_factor',
  MANUAL_ACTION = 'manual_action',
  CONFIRMATION = 'confirmation',
}

export interface InteractionRequest {
  id: string
  type: InteractionType
  pageUrl: string
  pageTitle: string
  message: string
  fields?: Array<{
    name: string
    label: string
    type: string
    required: boolean
  }>
  expectedActions?: string[]
  timeout?: number
}

export interface InteractionResponse {
  requestId: string
  success: boolean
  action: 'completed' | 'skipped' | 'cancelled'
  data?: Record<string, any>
}

/**
 * BrowserInteractiveHandler
 *
 * Injects a floating UI into the crawler's own page when user action is needed.
 * No extra tabs, no extra pages. The user interacts on the same page the
 * crawler navigated to.
 */
export class BrowserInteractiveHandler extends EventEmitter {
  private isWaitingForUser = false
  private currentRequest: InteractionRequest | null = null
  private resolveUserResponse: ((response: InteractionResponse) => void) | null = null
  private activePage: Page | null = null
  private cleanupFns: Array<() => void> = []

  /**
   * Request user interaction by injecting UI into the given page.
   * This is the crawler's actual page — not a new tab.
   */
  async requestInteraction(page: Page, request: InteractionRequest): Promise<InteractionResponse> {
    if (this.isWaitingForUser) {
      throw new Error('Already waiting for user interaction')
    }

    this.isWaitingForUser = true
    this.currentRequest = request
    this.activePage = page

    this.emit('interaction:required', request)

    try {
      // Inject the floating UI directly into the crawler's page
      await this.injectHelperUI(page, request)

      // Listen for user actions via console messages
      this.setupConsoleListener(page)

      // Re-inject UI if page reloads (e.g. after form submit / login redirect)
      const reloadHandler = async () => {
        if (this.isWaitingForUser && this.currentRequest) {
          // Small delay to let page render
          await new Promise(r => setTimeout(r, 500))
          await this.injectHelperUI(page, this.currentRequest).catch(() => {})
        }
      }
      page.on('load', reloadHandler)
      this.cleanupFns.push(() => page.removeListener('load', reloadHandler))

      // Bring browser window to front
      await page.bringToFront().catch(() => {})

      // Wait for user response or timeout
      const timeout = request.timeout ?? 300000
      const response = await Promise.race([
        new Promise<InteractionResponse>((resolve) => {
          this.resolveUserResponse = resolve
        }),
        new Promise<InteractionResponse>((resolve) => {
          const timer = setTimeout(() => {
            resolve({
              requestId: request.id,
              success: false,
              action: 'cancelled',
            })
          }, timeout)
          this.cleanupFns.push(() => clearTimeout(timer))
        }),
      ])

      this.emit('interaction:completed', response)
      return response
    } finally {
      await this.cleanup()
    }
  }

  async markCompleted(data?: Record<string, any>) {
    if (!this.resolveUserResponse || !this.currentRequest) return

    const request = this.currentRequest
    const resolve = this.resolveUserResponse

    // Extract any form data the user filled in
    const extractedData = this.activePage
      ? await this.extractFormData(this.activePage)
      : {}

    await this.removeHelperUI()

    resolve({
      requestId: request.id,
      success: true,
      action: 'completed',
      data: { ...extractedData, ...data },
    })
  }

  async markSkipped() {
    if (!this.resolveUserResponse || !this.currentRequest) return

    const request = this.currentRequest
    const resolve = this.resolveUserResponse

    await this.removeHelperUI()

    resolve({
      requestId: request.id,
      success: true,
      action: 'skipped',
    })
  }

  async markCancelled() {
    if (!this.resolveUserResponse || !this.currentRequest) return

    const request = this.currentRequest
    const resolve = this.resolveUserResponse

    await this.removeHelperUI()

    resolve({
      requestId: request.id,
      success: false,
      action: 'cancelled',
    })
  }

  /**
   * Request OAuth interaction — does NOT inject UI into the page.
   * OAuth pages are on third-party domains where we can't inject.
   * Only emits event and waits for external resolution.
   */
  async requestOAuthInteraction(request: InteractionRequest): Promise<InteractionResponse> {
    if (this.isWaitingForUser) {
      throw new Error('Already waiting for user interaction')
    }

    this.isWaitingForUser = true
    this.currentRequest = request

    this.emit('interaction:required', request)

    try {
      const timeout = request.timeout ?? 300000
      const response = await Promise.race([
        new Promise<InteractionResponse>((resolve) => {
          this.resolveUserResponse = resolve
        }),
        new Promise<InteractionResponse>((resolve) => {
          const timer = setTimeout(() => {
            resolve({
              requestId: request.id,
              success: false,
              action: 'cancelled',
            })
          }, timeout)
          this.cleanupFns.push(() => clearTimeout(timer))
        }),
      ])

      this.emit('interaction:completed', response)
      return response
    } finally {
      this.isWaitingForUser = false
      this.currentRequest = null
      this.resolveUserResponse = null
      for (const fn of this.cleanupFns) {
        try { fn() } catch {}
      }
      this.cleanupFns = []
    }
  }

  isWaiting(): boolean {
    return this.isWaitingForUser
  }

  getCurrentRequest(): InteractionRequest | null {
    return this.currentRequest
  }

  async close() {
    await this.cleanup()
  }

  // ── Private ───────────────────────────────────────────────

  private async cleanup() {
    await this.removeHelperUI()
    for (const fn of this.cleanupFns) {
      try { fn() } catch {}
    }
    this.cleanupFns = []
    this.isWaitingForUser = false
    this.currentRequest = null
    this.resolveUserResponse = null
    this.activePage = null
  }

  private setupConsoleListener(page: Page) {
    const handler = async (msg: any) => {
      const text = msg.text()
      if (!text.startsWith('floww:action:')) return
      if (!this.currentRequest || !this.resolveUserResponse) return

      const action = text.slice('floww:action:'.length)
      if (action === 'continue') await this.markCompleted()
      else if (action === 'skip') await this.markSkipped()
      else if (action === 'cancel') await this.markCancelled()
    }
    page.on('console', handler)
    this.cleanupFns.push(() => page.removeListener('console', handler))
  }

  private async removeHelperUI() {
    if (!this.activePage) return
    try {
      await this.activePage.evaluate(() => {
        const el = document.getElementById('floww-helper-ui')
        if (el) el.remove()
        const style = document.getElementById('floww-helper-style')
        if (style) style.remove()
      })
    } catch {}
  }

  private async extractFormData(page: Page): Promise<Record<string, any>> {
    try {
      return await page.evaluate(() => {
        const data: Record<string, any> = {}
        document.querySelectorAll('input, select, textarea').forEach((el: any) => {
          const name = el.name || el.id
          if (name && el.value) data[name] = el.value
        })
        return data
      })
    } catch {
      return {}
    }
  }

  private async injectHelperUI(page: Page, request: InteractionRequest) {
    const typeLabel = request.type.replace(/_/g, ' ').toUpperCase()
    const message = request.message.replace(/'/g, "\\'").replace(/\n/g, ' ')

    await page.evaluate(`(function() {
      var existing = document.getElementById('floww-helper-ui');
      if (existing) existing.remove();
      var oldStyle = document.getElementById('floww-helper-style');
      if (oldStyle) oldStyle.remove();

      var style = document.createElement('style');
      style.id = 'floww-helper-style';
      style.textContent = [
        '@keyframes floww-slideIn { from { transform: translateX(450px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }',
        '#floww-helper-ui { position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 380px; animation: floww-slideIn 0.3s ease-out; line-height: 1.5; }',
        '#floww-helper-ui h3 { margin: 0 0 2px 0; font-size: 15px; font-weight: 700; }',
        '#floww-helper-ui .floww-sub { font-size: 11px; opacity: 0.85; margin: 0 0 12px 0; }',
        '#floww-helper-ui .floww-msg { font-size: 13px; margin: 0 0 14px 0; }',
        '#floww-helper-ui .floww-hint { font-size: 10px; opacity: 0.7; margin: 0 0 12px 0; }',
        '#floww-helper-ui .floww-btns { display: flex; gap: 8px; flex-wrap: wrap; }',
        '#floww-helper-ui button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: transform 0.15s, box-shadow 0.15s; }',
        '#floww-helper-ui button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }',
        '#floww-helper-ui .btn-go { background: white; color: #667eea; }',
        '#floww-helper-ui .btn-skip { background: rgba(255,255,255,0.2); color: white; }',
        '#floww-helper-ui .btn-stop { background: #ef4444; color: white; }',
      ].join('\\n');
      document.head.appendChild(style);

      var c = document.createElement('div');
      c.id = 'floww-helper-ui';
      c.innerHTML = '<h3>Floww Crawler</h3>'
        + '<p class="floww-sub">${typeLabel}</p>'
        + '<p class="floww-msg">${message}</p>'
        + '<p class="floww-hint">Ctrl+Enter = Continue | Ctrl+S = Skip | Ctrl+X = Stop</p>'
        + '<div class="floww-btns">'
        + '<button class="btn-go" onclick="console.log(\\'floww:action:continue\\')">Continue Crawling</button>'
        + '<button class="btn-skip" onclick="console.log(\\'floww:action:skip\\')">Skip</button>'
        + '<button class="btn-stop" onclick="console.log(\\'floww:action:cancel\\')">Stop</button>'
        + '</div>';
      document.body.appendChild(c);

      document.addEventListener('keydown', function flowwKeys(e) {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'Enter') { e.preventDefault(); console.log('floww:action:continue'); }
          else if (e.key === 's') { e.preventDefault(); console.log('floww:action:skip'); }
          else if (e.key === 'x') { e.preventDefault(); console.log('floww:action:cancel'); }
        }
      });
    })()`)
  }
}
