import { describe, it, expect, beforeEach } from 'vitest'
import { CrawlStatistics } from '../stats/statistics'
import { ErrorTracker } from '../stats/error-tracker'

describe('CrawlStatistics', () => {
  let stats: CrawlStatistics

  beforeEach(() => {
    stats = new CrawlStatistics()
  })

  it('starts at zero', () => {
    const snap = stats.getSnapshot()
    expect(snap.totalRequests).toBe(0)
    expect(snap.successCount).toBe(0)
    expect(snap.failedCount).toBe(0)
  })

  it('records successes', () => {
    stats.recordSuccess('https://example.com/a', 100)
    stats.recordSuccess('https://example.com/b', 200)

    const snap = stats.getSnapshot()
    expect(snap.successCount).toBe(2)
    expect(snap.totalRequests).toBe(2)
    expect(snap.avgProcessingTimeMs).toBe(150)
  })

  it('records failures', () => {
    stats.recordFailure('https://example.com/a', new Error('Timeout'))
    stats.recordFailure('https://example.com/b', new TypeError('Invalid'))

    const snap = stats.getSnapshot()
    expect(snap.failedCount).toBe(2)
    expect(snap.totalRequests).toBe(2)
    expect(Object.keys(snap.errorsByType).length).toBeGreaterThan(0)
  })

  it('records skips and retries', () => {
    stats.recordSkip()
    stats.recordRetry()

    const snap = stats.getSnapshot()
    expect(snap.skippedCount).toBe(1)
    expect(snap.retryCount).toBe(1)
  })

  it('resets all counters', () => {
    stats.recordSuccess('https://example.com', 100)
    stats.recordFailure('https://example.com', new Error('fail'))
    stats.reset()

    const snap = stats.getSnapshot()
    expect(snap.totalRequests).toBe(0)
    expect(snap.successCount).toBe(0)
    expect(snap.failedCount).toBe(0)
  })

  it('tracks elapsed time', () => {
    const snap = stats.getSnapshot()
    expect(snap.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(snap.startedAt).toBeInstanceOf(Date)
  })
})

describe('ErrorTracker', () => {
  let tracker: ErrorTracker

  beforeEach(() => {
    tracker = new ErrorTracker()
  })

  it('tracks errors', () => {
    tracker.track('https://example.com/a', new Error('Timeout'))
    tracker.track('https://example.com/b', new Error('Timeout'))

    expect(tracker.total).toBe(2)
  })

  it('groups errors by type and message', () => {
    tracker.track('https://example.com/a', new Error('Timeout'))
    tracker.track('https://example.com/b', new Error('Timeout'))
    tracker.track('https://example.com/c', new TypeError('Invalid'))

    const grouped = tracker.getGrouped()
    expect(Object.keys(grouped).length).toBe(2)
  })

  it('returns recent errors', () => {
    tracker.track('https://example.com/a', new Error('Error 1'))
    tracker.track('https://example.com/b', new Error('Error 2'))

    const recent = tracker.getRecent(1)
    expect(recent).toHaveLength(1)
  })

  it('clears errors', () => {
    tracker.track('https://example.com/a', new Error('Test'))
    tracker.clear()

    expect(tracker.total).toBe(0)
    expect(tracker.getRecent()).toHaveLength(0)
  })
})
