/**
 * Redis-backed Request Queue using BullMQ
 *
 * Provides persistent, deduplicated URL queue that survives restarts.
 * Falls back to MemoryQueue if Redis is not available.
 */

import type { CrawlRequest } from '../types'
import type { IRequestQueue } from './queue-interface'
import { normalizeUrl } from './request'

let BullMQ: any = null
let IORedis: any = null

// Dynamic imports for optional dependencies
async function loadBullMQ() {
  if (!BullMQ) {
    try {
      BullMQ = await import('bullmq')
      IORedis = (await import('ioredis')).default
    } catch {
      throw new Error('bullmq and ioredis are required for Redis queue. Install them: npm install bullmq ioredis')
    }
  }
}

export class RedisQueue implements IRequestQueue {
  private queue: any = null
  private dedup: any = null // Redis client for dedup set
  private redisUrl: string
  private queueName: string
  private _handledCount = 0
  private ready = false

  constructor(redisUrl: string, queueName: string = 'floww-crawl') {
    this.redisUrl = redisUrl
    this.queueName = queueName
  }

  async init(): Promise<void> {
    await loadBullMQ()

    this.dedup = new IORedis(this.redisUrl, { maxRetriesPerRequest: null, connectTimeout: 5000 })
    this.queue = new BullMQ.Queue(this.queueName, {
      connection: new IORedis(this.redisUrl, { maxRetriesPerRequest: null, connectTimeout: 5000 }),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    })
    this.ready = true
  }

  async add(request: CrawlRequest): Promise<boolean> {
    if (!this.ready) await this.init()

    const normalized = normalizeUrl(request.url)
    const dedupKey = `${this.queueName}:seen`

    // Check if already seen
    const alreadySeen = await this.dedup.sismember(dedupKey, normalized)
    if (alreadySeen) return false

    // Add to dedup set
    await this.dedup.sadd(dedupKey, normalized)

    // Add to BullMQ queue
    await this.queue.add('crawl', request, {
      priority: request.priority,
      jobId: request.id,
    })

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
    if (!this.ready) await this.init()

    // BullMQ doesn't have a direct "get next" — we use a worker pattern
    // For simplicity, we use getJobs to peek at waiting jobs
    const jobs = await this.queue.getJobs(['waiting'], 0, 0)
    if (jobs.length === 0) return null

    const job = jobs[0]
    return job.data as CrawlRequest
  }

  async markHandled(id: string): Promise<void> {
    this._handledCount++
    try {
      const job = await this.queue.getJob(id)
      if (job) await job.remove()
    } catch {}
  }

  async markFailed(id: string): Promise<void> {
    try {
      const job = await this.queue.getJob(id)
      if (job) await job.remove()
    } catch {}
  }

  async reclaimRequest(request: CrawlRequest): Promise<void> {
    if (!this.ready) await this.init()

    // Re-add with new ID (bypass dedup since this is a retry)
    await this.queue.add('crawl', request, {
      priority: request.priority,
      jobId: request.id + '-retry-' + request.retryCount,
    })
  }

  async isEmpty(): Promise<boolean> {
    if (!this.ready) return true
    const counts = await this.queue.getJobCounts('waiting', 'active')
    return (counts.waiting || 0) + (counts.active || 0) === 0
  }

  async size(): Promise<number> {
    if (!this.ready) return 0
    const counts = await this.queue.getJobCounts('waiting')
    return counts.waiting || 0
  }

  async handledCount(): Promise<number> {
    return this._handledCount
  }

  async has(url: string): Promise<boolean> {
    if (!this.ready) return false
    const normalized = normalizeUrl(url)
    const dedupKey = `${this.queueName}:seen`
    return !!(await this.dedup.sismember(dedupKey, normalized))
  }

  async clear(): Promise<void> {
    if (!this.ready) return
    await this.queue.obliterate({ force: true })
    await this.dedup.del(`${this.queueName}:seen`)
    this._handledCount = 0
  }

  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close()
      this.queue = null
    }
    if (this.dedup) {
      await this.dedup.quit()
      this.dedup = null
    }
    this.ready = false
  }
}
