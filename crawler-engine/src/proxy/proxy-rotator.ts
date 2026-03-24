/**
 * ProxyRotator — Manages a pool of proxies with rotation strategies and health tracking.
 * Inspired by Scrapling's proxy rotation system.
 */

export interface ProxyConfig {
  url: string
  username?: string
  password?: string
}

export type RotationStrategy = 'round-robin' | 'random' | 'least-used'

export interface ProxyHealth {
  url: string
  successCount: number
  failCount: number
  dead: boolean
  lastUsedAt: Date | null
}

export class ProxyRotator {
  private proxies: ProxyConfig[]
  private strategy: RotationStrategy
  private index = 0
  private maxFailures: number

  private usageCount = new Map<string, number>()
  private failCount = new Map<string, number>()
  private successCount = new Map<string, number>()
  private deadProxies = new Set<string>()
  private lastUsed = new Map<string, Date>()

  constructor(proxies: ProxyConfig[], strategy: RotationStrategy = 'round-robin', maxFailures = 3) {
    this.proxies = proxies
    this.strategy = strategy
    this.maxFailures = maxFailures
  }

  /**
   * Get the next proxy based on rotation strategy. Returns null if all are dead.
   */
  getNext(): ProxyConfig | null {
    const alive = this.proxies.filter(p => !this.deadProxies.has(p.url))
    if (alive.length === 0) return null

    let proxy: ProxyConfig

    switch (this.strategy) {
      case 'round-robin': {
        proxy = alive[this.index % alive.length]
        this.index++
        break
      }
      case 'random': {
        proxy = alive[Math.floor(Math.random() * alive.length)]
        break
      }
      case 'least-used': {
        proxy = alive.reduce((min, p) => {
          const minUsage = this.usageCount.get(min.url) || 0
          const pUsage = this.usageCount.get(p.url) || 0
          return pUsage < minUsage ? p : min
        }, alive[0])
        break
      }
    }

    this.usageCount.set(proxy.url, (this.usageCount.get(proxy.url) || 0) + 1)
    this.lastUsed.set(proxy.url, new Date())
    return proxy
  }

  /**
   * Mark a proxy as having succeeded
   */
  markSuccess(proxyUrl: string): void {
    this.successCount.set(proxyUrl, (this.successCount.get(proxyUrl) || 0) + 1)
    // Reset fail count on success
    this.failCount.set(proxyUrl, 0)
  }

  /**
   * Mark a proxy as having failed. After maxFailures consecutive failures, mark as dead.
   */
  markFailed(proxyUrl: string): void {
    const fails = (this.failCount.get(proxyUrl) || 0) + 1
    this.failCount.set(proxyUrl, fails)
    if (fails >= this.maxFailures) {
      this.deadProxies.add(proxyUrl)
    }
  }

  /**
   * Revive a dead proxy (e.g. after a cooldown period)
   */
  revive(proxyUrl: string): void {
    this.deadProxies.delete(proxyUrl)
    this.failCount.set(proxyUrl, 0)
  }

  /**
   * Revive all dead proxies
   */
  reviveAll(): void {
    this.deadProxies.clear()
    this.failCount.clear()
  }

  /**
   * Get health report for all proxies
   */
  getHealthReport(): ProxyHealth[] {
    return this.proxies.map(p => ({
      url: p.url,
      successCount: this.successCount.get(p.url) || 0,
      failCount: this.failCount.get(p.url) || 0,
      dead: this.deadProxies.has(p.url),
      lastUsedAt: this.lastUsed.get(p.url) || null,
    }))
  }

  /**
   * Check if there are any alive proxies
   */
  hasAlive(): boolean {
    return this.proxies.some(p => !this.deadProxies.has(p.url))
  }

  get size(): number {
    return this.proxies.length
  }

  get aliveCount(): number {
    return this.proxies.filter(p => !this.deadProxies.has(p.url)).length
  }
}
