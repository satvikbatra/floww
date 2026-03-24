/**
 * Rate Limiter Middleware — Prevents API abuse
 *
 * In-memory token bucket per IP. Configurable per-route limits.
 * For production with multiple instances, use Redis-backed rate limiting.
 */

import { Context, Next } from 'hono'
import { apiLogger } from '../utils/logger'

interface RateLimitBucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, RateLimitBucket>()

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 600000) { // 10 min idle
      buckets.delete(key)
    }
  }
}, 300000)

interface RateLimitConfig {
  maxRequests: number   // tokens per window
  windowMs: number      // refill window in ms
  keyFn?: (c: Context) => string // custom key function
}

/**
 * Create rate limit middleware
 */
export function rateLimit(config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    // Use custom key function, or fall back to a connection-based identifier.
    // Do NOT trust X-Forwarded-For blindly — it can be spoofed.
    const key = config.keyFn
      ? config.keyFn(c)
      : c.req.header('x-real-ip') || 'global'

    const now = Date.now()
    let bucket = buckets.get(key)

    if (!bucket) {
      bucket = { tokens: config.maxRequests, lastRefill: now }
      buckets.set(key, bucket)
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill
    const refillRate = config.maxRequests / config.windowMs
    bucket.tokens = Math.min(config.maxRequests, bucket.tokens + elapsed * refillRate)
    bucket.lastRefill = now

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate / 1000)
      apiLogger.warn('Rate limit exceeded', { ip: key, retryAfter })

      c.res.headers.set('Retry-After', String(retryAfter))
      c.res.headers.set('X-RateLimit-Limit', String(config.maxRequests))
      c.res.headers.set('X-RateLimit-Remaining', '0')

      return c.json({ error: 'Too many requests. Please try again later.' }, 429)
    }

    bucket.tokens -= 1

    // Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', String(config.maxRequests))
    c.res.headers.set('X-RateLimit-Remaining', String(Math.floor(bucket.tokens)))

    return next()
  }
}

// Pre-built rate limiters
export const apiRateLimit = rateLimit({ maxRequests: 100, windowMs: 60000 })         // 100 req/min
export const crawlRateLimit = rateLimit({ maxRequests: 5, windowMs: 60000 })          // 5 crawls/min
export const authRateLimit = rateLimit({ maxRequests: 10, windowMs: 60000 })          // 10 auth attempts/min
export const documentRateLimit = rateLimit({ maxRequests: 10, windowMs: 60000 })      // 10 doc gen/min
