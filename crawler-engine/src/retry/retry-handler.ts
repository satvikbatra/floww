import type { CrawlRequest } from '../types'

export class RetryHandler {
  private maxRetries: number
  private retryDelayMs: number

  constructor(maxRetries: number = 2, retryDelayMs: number = 2000) {
    this.maxRetries = maxRetries
    this.retryDelayMs = retryDelayMs
  }

  shouldRetry(request: CrawlRequest, error: Error): boolean {
    if (request.retryCount >= this.maxRetries) return false

    // Don't retry certain errors
    const msg = error.message.toLowerCase()
    if (msg.includes('net::err_aborted')) return false
    if (msg.includes('invalid url')) return false
    if (msg.includes('protocol error')) return false

    return true
  }

  prepareForRetry(request: CrawlRequest): CrawlRequest {
    return {
      ...request,
      retryCount: request.retryCount + 1,
      priority: request.priority + 5, // lower priority on retry
    }
  }

  getDelay(attempt: number): number {
    // Exponential backoff: 2s, 4s, 8s...
    return this.retryDelayMs * Math.pow(2, attempt)
  }
}
