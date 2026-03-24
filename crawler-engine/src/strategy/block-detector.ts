/**
 * BlockDetector — Detects when a domain is blocking crawl requests.
 * Tracks consecutive failures and challenge encounters per domain.
 * Inspired by Scrapling's automatic blocked request detection.
 */

export interface BlockSignal {
  domain: string
  reason: 'consecutive-failures' | 'challenge-flood' | 'rate-limited'
  consecutiveCount: number
  recommendedAction: 'increase-delay' | 'rotate-proxy' | 'back-off'
}

export class BlockDetector {
  private consecutiveFailures = new Map<string, number>()
  private challengeCount = new Map<string, number>()
  private domainDelayMultiplier = new Map<string, number>()
  private threshold: number

  constructor(threshold = 5) {
    this.threshold = threshold
  }

  /**
   * Record a failure for a domain. Returns a BlockSignal if threshold is reached.
   */
  recordFailure(domain: string, reason: string): BlockSignal | null {
    const count = (this.consecutiveFailures.get(domain) || 0) + 1
    this.consecutiveFailures.set(domain, count)

    if (count >= this.threshold) {
      const isRateLimited = reason.includes('429') || reason.toLowerCase().includes('rate limit')
      return {
        domain,
        reason: isRateLimited ? 'rate-limited' : 'consecutive-failures',
        consecutiveCount: count,
        recommendedAction: isRateLimited ? 'back-off' : 'rotate-proxy',
      }
    }
    return null
  }

  /**
   * Record a challenge encounter for a domain
   */
  recordChallenge(domain: string, _type: string): BlockSignal | null {
    const count = (this.challengeCount.get(domain) || 0) + 1
    this.challengeCount.set(domain, count)

    if (count >= this.threshold) {
      return {
        domain,
        reason: 'challenge-flood',
        consecutiveCount: count,
        recommendedAction: 'rotate-proxy',
      }
    }
    return null
  }

  /**
   * Record a success — resets consecutive failure counter for the domain
   */
  recordSuccess(domain: string): void {
    this.consecutiveFailures.set(domain, 0)
  }

  /**
   * Check if a domain is currently considered blocked
   */
  isBlocked(domain: string): boolean {
    const fails = this.consecutiveFailures.get(domain) || 0
    const challenges = this.challengeCount.get(domain) || 0
    return fails >= this.threshold || challenges >= this.threshold
  }

  /**
   * Get the delay multiplier for a domain (increases when blocked)
   */
  getDelayMultiplier(domain: string): number {
    return this.domainDelayMultiplier.get(domain) || 1
  }

  /**
   * Increase delay for a domain (adaptive throttling)
   */
  increaseDelay(domain: string): void {
    const current = this.domainDelayMultiplier.get(domain) || 1
    this.domainDelayMultiplier.set(domain, Math.min(current * 2, 16))
  }

  /**
   * Reset delay multiplier for a domain
   */
  resetDelay(domain: string): void {
    this.domainDelayMultiplier.set(domain, 1)
  }

  /**
   * Get all currently blocked domains
   */
  getBlockedDomains(): string[] {
    const blocked: string[] = []
    for (const [domain, count] of this.consecutiveFailures) {
      if (count >= this.threshold) blocked.push(domain)
    }
    for (const [domain, count] of this.challengeCount) {
      if (count >= this.threshold && !blocked.includes(domain)) blocked.push(domain)
    }
    return blocked
  }

  reset(): void {
    this.consecutiveFailures.clear()
    this.challengeCount.clear()
    this.domainDelayMultiplier.clear()
  }
}
