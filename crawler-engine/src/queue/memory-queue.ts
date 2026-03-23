import type { CrawlRequest } from '../types'
import type { IRequestQueue } from './queue-interface'
import { normalizeUrl } from './request'

/**
 * In-memory request queue with deduplication and priority.
 * For development/small crawls. No persistence across restarts.
 */
export class MemoryQueue implements IRequestQueue {
  private pending: CrawlRequest[] = []
  private seen = new Set<string>() // normalized URLs for dedup
  private handled = new Set<string>()
  private failed = new Set<string>()

  async add(request: CrawlRequest): Promise<boolean> {
    const normalized = normalizeUrl(request.url)
    if (this.seen.has(normalized)) return false
    this.seen.add(normalized)
    this.pending.push(request)
    // Sort by priority (lower = higher priority)
    this.pending.sort((a, b) => a.priority - b.priority)
    return true
  }

  async addMany(requests: CrawlRequest[]): Promise<number> {
    let count = 0
    for (const req of requests) {
      if (await this.add(req)) count++
    }
    return count
  }

  async fetchNext(): Promise<CrawlRequest | null> {
    return this.pending.shift() ?? null
  }

  async markHandled(id: string): Promise<void> {
    this.handled.add(id)
  }

  async markFailed(id: string): Promise<void> {
    this.failed.add(id)
  }

  async reclaimRequest(request: CrawlRequest): Promise<void> {
    // Re-add for retry without dedup check
    this.pending.push(request)
    this.pending.sort((a, b) => a.priority - b.priority)
  }

  async isEmpty(): Promise<boolean> {
    return this.pending.length === 0
  }

  async size(): Promise<number> {
    return this.pending.length
  }

  async handledCount(): Promise<number> {
    return this.handled.size
  }

  async has(url: string): Promise<boolean> {
    return this.seen.has(normalizeUrl(url))
  }

  async clear(): Promise<void> {
    this.pending = []
    this.seen.clear()
    this.handled.clear()
    this.failed.clear()
  }

  async close(): Promise<void> {
    // no-op for memory queue
  }
}
