/**
 * Usage Metering — Tracks resource consumption per user for billing
 *
 * Tracks: pages crawled, documents generated, AI analysis calls,
 * storage used, API calls made.
 */

import { db } from '../../db/client'
import { apiLogger } from '../../utils/logger'

export interface UsageRecord {
  userId: string
  event: UsageEvent
  quantity: number
  metadata?: Record<string, any>
  timestamp: Date
}

export type UsageEvent =
  | 'crawl.pages'
  | 'crawl.sessions'
  | 'document.generated'
  | 'analysis.pages'
  | 'api.calls'
  | 'storage.bytes'

// In-memory buffer — flush to DB periodically
const usageBuffer: UsageRecord[] = []
const FLUSH_INTERVAL_MS = 30000 // 30 seconds
const MAX_BUFFER_SIZE = 100

let flushTimer: NodeJS.Timeout | null = null

/**
 * Record a usage event
 */
export function trackUsage(userId: string, event: UsageEvent, quantity: number = 1, metadata?: Record<string, any>): void {
  usageBuffer.push({
    userId,
    event,
    quantity,
    metadata,
    timestamp: new Date(),
  })

  if (usageBuffer.length >= MAX_BUFFER_SIZE) {
    flushUsage().catch(() => {})
  }
}

/**
 * Flush buffered usage records to database
 */
export async function flushUsage(): Promise<void> {
  if (usageBuffer.length === 0) return

  const records = usageBuffer.splice(0, usageBuffer.length)

  try {
    // Aggregate by userId + event for the flush period
    const aggregated = new Map<string, { userId: string; event: string; quantity: number }>()

    for (const record of records) {
      const key = `${record.userId}:${record.event}`
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += record.quantity
      } else {
        aggregated.set(key, { userId: record.userId, event: record.event, quantity: record.quantity })
      }
    }

    apiLogger.debug('Flushing usage records', { count: aggregated.size })

    // TODO: Write to a usage_events table when billing is implemented.
    // Currently logs usage for audit trail only.
    for (const [, usage] of aggregated) {
      apiLogger.debug('Usage', { userId: usage.userId, event: usage.event, quantity: usage.quantity })
    }
  } catch (error) {
    apiLogger.error('Failed to flush usage records', error)
    // Re-add to buffer on failure
    usageBuffer.push(...records)
  }
}

/**
 * Get usage summary for a user
 */
export async function getUserUsageSummary(userId: string): Promise<Record<string, number>> {
  // Count from database
  const [projectCount, sessionCount, snapshotCount, documentCount] = await Promise.all([
    db.project.count({ where: { ownerId: userId } }),
    db.crawlSession.count({
      where: { project: { ownerId: userId } },
    }),
    db.snapshot.count({
      where: { project: { ownerId: userId } },
    }),
    db.document.count({ where: { userId } }),
  ])

  return {
    projects: projectCount,
    crawlSessions: sessionCount,
    pagesCrawled: snapshotCount,
    documentsGenerated: documentCount,
  }
}

/**
 * Start periodic flush timer
 */
export function startUsageTracking(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    flushUsage().catch(() => {})
  }, FLUSH_INTERVAL_MS)
}

/**
 * Stop tracking and flush remaining records
 */
export async function stopUsageTracking(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  await flushUsage()
}
