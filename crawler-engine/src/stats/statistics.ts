import type { CrawlStatisticsSnapshot } from '../types'

export interface DomainStats {
  domain: string
  successCount: number
  failedCount: number
  avgLoadTimeMs: number
  challengeCount: number
}

export class CrawlStatistics {
  private _success = 0
  private _failed = 0
  private _skipped = 0
  private _retries = 0
  private _totalTimeMs = 0
  private _times: number[] = []
  private _errors = new Map<string, number>()
  private _startedAt = new Date()

  // Per-domain tracking
  private _domainSuccess = new Map<string, number>()
  private _domainFailed = new Map<string, number>()
  private _domainTimes = new Map<string, number[]>()
  private _domainChallenges = new Map<string, number>()

  recordSuccess(url: string, durationMs: number): void {
    this._success++
    this._totalTimeMs += durationMs
    this._times.push(durationMs)

    const domain = this.extractDomain(url)
    if (domain) {
      this._domainSuccess.set(domain, (this._domainSuccess.get(domain) || 0) + 1)
      const times = this._domainTimes.get(domain) || []
      times.push(durationMs)
      this._domainTimes.set(domain, times)
    }
  }

  recordFailure(url: string, error: Error): void {
    this._failed++
    const key = error.constructor.name + ': ' + (error.message || '').substring(0, 100)
    this._errors.set(key, (this._errors.get(key) || 0) + 1)

    const domain = this.extractDomain(url)
    if (domain) {
      this._domainFailed.set(domain, (this._domainFailed.get(domain) || 0) + 1)
    }
  }

  recordSkip(): void {
    this._skipped++
  }

  recordRetry(): void {
    this._retries++
  }

  recordChallenge(domain: string): void {
    this._domainChallenges.set(domain, (this._domainChallenges.get(domain) || 0) + 1)
  }

  getSnapshot(): CrawlStatisticsSnapshot {
    const elapsedMs = Date.now() - this._startedAt.getTime()
    const total = this._success + this._failed + this._skipped
    const avgMs = this._times.length > 0
      ? this._times.reduce((a, b) => a + b, 0) / this._times.length
      : 0

    return {
      totalRequests: total,
      successCount: this._success,
      failedCount: this._failed,
      skippedCount: this._skipped,
      retryCount: this._retries,
      avgProcessingTimeMs: Math.round(avgMs),
      errorsByType: Object.fromEntries(this._errors),
      requestsPerMinute: elapsedMs > 0 ? Math.round(total / (elapsedMs / 60000) * 10) / 10 : 0,
      startedAt: this._startedAt,
      elapsedMs,
    }
  }

  getDomainStats(): Record<string, DomainStats> {
    const result: Record<string, DomainStats> = {}
    const allDomains = new Set([
      ...this._domainSuccess.keys(),
      ...this._domainFailed.keys(),
    ])

    for (const domain of allDomains) {
      const times = this._domainTimes.get(domain) || []
      const avgMs = times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0

      result[domain] = {
        domain,
        successCount: this._domainSuccess.get(domain) || 0,
        failedCount: this._domainFailed.get(domain) || 0,
        avgLoadTimeMs: avgMs,
        challengeCount: this._domainChallenges.get(domain) || 0,
      }
    }
    return result
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }

  reset(): void {
    this._success = 0
    this._failed = 0
    this._skipped = 0
    this._retries = 0
    this._totalTimeMs = 0
    this._times = []
    this._errors.clear()
    this._startedAt = new Date()
    this._domainSuccess.clear()
    this._domainFailed.clear()
    this._domainTimes.clear()
    this._domainChallenges.clear()
  }
}
