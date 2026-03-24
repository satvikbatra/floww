import type { HookName, HookFn, HookContext } from './types'
import type { CrawlRequest } from '../types'
import type { Page } from 'playwright'

export class HookManager {
  private hooks = new Map<HookName, HookFn[]>()

  register(name: HookName, fn: HookFn): void {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, [])
    }
    this.hooks.get(name)!.push(fn)
  }

  /**
   * Execute all hooks for a given name sequentially.
   * Returns the context (may have been mutated by hooks).
   */
  async execute(name: HookName, ctx: HookContext): Promise<HookContext> {
    const fns = this.hooks.get(name) || []
    for (const fn of fns) {
      if (ctx.aborted || ctx.skipped || ctx.cancelled) break
      try {
        await fn(ctx)
      } catch (error) {
        const wrapped = new Error(`Hook "${name}" failed: ${error instanceof Error ? error.message : String(error)}`)
        if (error instanceof Error) wrapped.cause = error
        throw wrapped
      }
    }
    return ctx
  }

  /**
   * Check if any hooks are registered for a name
   */
  has(name: HookName): boolean {
    return (this.hooks.get(name)?.length ?? 0) > 0
  }

  /**
   * Create a fresh HookContext for a request
   */
  static createContext(request: CrawlRequest, page: Page): HookContext {
    const ctx: HookContext = {
      request,
      page,
      aborted: false,
      skipped: false,
      cancelled: false,
      abort: () => { ctx.aborted = true },
      skip: () => { ctx.skipped = true },
      cancelCrawl: () => { ctx.cancelled = true },
    }
    return ctx
  }
}
