import type { CrawlStatisticsSnapshot } from '../types'

export class CrawlStatistics {
  private _success = 0
  private _failed = 0
  private _skipped = 0
  private _retries = 0
  private _totalTimeMs = 0
  private _times: number[] = []
  private _errors = new Map<string, number>()
  private _startedAt = new Date()

  recordSuccess(url: string, durationMs: number): void {
    this._success++
    this._totalTimeMs += durationMs
    this._times.push(durationMs)
  }

  recordFailure(url: string, error: Error): void {
    this._failed++
    const key = error.constructor.name + ': ' + (error.message || '').substring(0, 100)
    this._errors.set(key, (this._errors.get(key) || 0) + 1)
  }

  recordSkip(): void {
    this._skipped++
  }

  recordRetry(): void {
    this._retries++
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

  reset(): void {
    this._success = 0
    this._failed = 0
    this._skipped = 0
    this._retries = 0
    this._totalTimeMs = 0
    this._times = []
    this._errors.clear()
    this._startedAt = new Date()
  }
}
