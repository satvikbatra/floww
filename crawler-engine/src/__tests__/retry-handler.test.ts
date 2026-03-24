import { describe, it, expect } from 'vitest'
import { RetryHandler } from '../retry/retry-handler'
import { createRequest } from '../queue/request'

describe('RetryHandler', () => {
  const handler = new RetryHandler(3, 2000)

  describe('shouldRetry', () => {
    it('allows retry when under max attempts', () => {
      const req = createRequest('https://example.com', { maxRetries: 3 })
      req.retryCount = 0

      expect(handler.shouldRetry(req, new Error('Timeout'))).toBe(true)
    })

    it('denies retry when at max attempts', () => {
      const req = createRequest('https://example.com', { maxRetries: 3 })
      req.retryCount = 3

      expect(handler.shouldRetry(req, new Error('Timeout'))).toBe(false)
    })

    it('denies retry for non-transient errors', () => {
      const req = createRequest('https://example.com', { maxRetries: 3 })
      req.retryCount = 0

      expect(handler.shouldRetry(req, new Error('net::err_aborted'))).toBe(false)
      expect(handler.shouldRetry(req, new Error('invalid url'))).toBe(false)
      expect(handler.shouldRetry(req, new Error('Protocol error'))).toBe(false)
    })
  })

  describe('prepareForRetry', () => {
    it('increments retry count', () => {
      const req = createRequest('https://example.com')
      const retried = handler.prepareForRetry(req)

      expect(retried.retryCount).toBe(1)
    })

    it('increases priority (lower priority on retry)', () => {
      const req = createRequest('https://example.com', { priority: 0 })
      const retried = handler.prepareForRetry(req)

      expect(retried.priority).toBeGreaterThan(0)
    })
  })

  describe('getDelay', () => {
    it('uses exponential backoff', () => {
      const delay0 = handler.getDelay(0)
      const delay1 = handler.getDelay(1)
      const delay2 = handler.getDelay(2)

      expect(delay1).toBeGreaterThan(delay0)
      expect(delay2).toBeGreaterThan(delay1)
    })

    it('starts from base delay', () => {
      expect(handler.getDelay(0)).toBe(2000)
    })
  })
})
