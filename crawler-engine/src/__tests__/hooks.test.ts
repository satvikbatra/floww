import { describe, it, expect, vi } from 'vitest'
import { HookManager } from '../hooks/hook-manager'
import { createRequest } from '../queue/request'
import type { HookContext } from '../hooks/types'

// Minimal Page mock for HookManager.createContext
const mockPage = { url: () => 'https://example.com' } as any

describe('HookManager', () => {
  it('registers and executes hooks', async () => {
    const manager = new HookManager()
    const fn = vi.fn()
    manager.register('beforeNavigate', fn)

    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)
    await manager.execute('beforeNavigate', ctx)

    expect(fn).toHaveBeenCalledOnce()
  })

  it('executes multiple hooks sequentially', async () => {
    const manager = new HookManager()
    const order: number[] = []

    manager.register('beforeNavigate', async () => { order.push(1) })
    manager.register('beforeNavigate', async () => { order.push(2) })
    manager.register('beforeNavigate', async () => { order.push(3) })

    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)
    await manager.execute('beforeNavigate', ctx)

    expect(order).toEqual([1, 2, 3])
  })

  it('stops execution on abort', async () => {
    const manager = new HookManager()
    const fn2 = vi.fn()

    manager.register('beforeNavigate', async (ctx: HookContext) => {
      ctx.abort()
    })
    manager.register('beforeNavigate', fn2)

    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)
    const result = await manager.execute('beforeNavigate', ctx)

    expect(result.aborted).toBe(true)
    expect(fn2).not.toHaveBeenCalled()
  })

  it('stops execution on skip', async () => {
    const manager = new HookManager()
    const fn2 = vi.fn()

    manager.register('afterNavigate', async (ctx: HookContext) => {
      ctx.skip()
    })
    manager.register('afterNavigate', fn2)

    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)
    const result = await manager.execute('afterNavigate', ctx)

    expect(result.skipped).toBe(true)
    expect(fn2).not.toHaveBeenCalled()
  })

  it('stops execution on cancelCrawl', async () => {
    const manager = new HookManager()
    const fn2 = vi.fn()

    manager.register('beforeProcess', async (ctx: HookContext) => {
      ctx.cancelCrawl()
    })
    manager.register('beforeProcess', fn2)

    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)
    const result = await manager.execute('beforeProcess', ctx)

    expect(result.cancelled).toBe(true)
    expect(fn2).not.toHaveBeenCalled()
  })

  it('has() returns true when hooks are registered', () => {
    const manager = new HookManager()
    expect(manager.has('beforeNavigate')).toBe(false)

    manager.register('beforeNavigate', async () => {})
    expect(manager.has('beforeNavigate')).toBe(true)
  })

  it('createContext initializes control flow functions', () => {
    const ctx = HookManager.createContext(createRequest('https://example.com'), mockPage)

    expect(ctx.aborted).toBe(false)
    expect(ctx.skipped).toBe(false)
    expect(ctx.cancelled).toBe(false)
    expect(typeof ctx.abort).toBe('function')
    expect(typeof ctx.skip).toBe('function')
    expect(typeof ctx.cancelCrawl).toBe('function')
  })
})
