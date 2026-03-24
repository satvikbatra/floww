import { describe, it, expect, beforeEach } from 'vitest'
import { SimilarityDetector } from '../strategy/similarity'

describe('SimilarityDetector', () => {
  let detector: SimilarityDetector

  beforeEach(() => {
    detector = new SimilarityDetector({
      maxSimilarUrlsPerPattern: 3,
      contentSimilarityThreshold: 0.85,
    })
  })

  describe('shouldSkipUrl', () => {
    it('does not skip first occurrence of a URL pattern', () => {
      const result = detector.shouldSkipUrl('https://example.com/products/123')
      expect(result.skip).toBe(false)
    })

    it('skips after maxSimilarUrlsPerPattern', () => {
      // Same pattern: /products/:id
      detector.shouldSkipUrl('https://example.com/products/1')
      detector.shouldSkipUrl('https://example.com/products/2')
      detector.shouldSkipUrl('https://example.com/products/3')

      const result = detector.shouldSkipUrl('https://example.com/products/4')
      expect(result.skip).toBe(true)
      expect(result.reason).toBeDefined()
    })

    it('normalizes numeric IDs in URL patterns', () => {
      // maxSimilarUrlsPerPattern is 3, count starts at 1 per URL
      // First call creates pattern with count 1
      // Subsequent calls increment: 2, 3 — at 3 it's >= max, so 4th should skip
      detector.shouldSkipUrl('https://example.com/products/1')
      detector.shouldSkipUrl('https://example.com/products/2')
      detector.shouldSkipUrl('https://example.com/products/3')

      // 4th URL with same pattern should be skipped
      const result = detector.shouldSkipUrl('https://example.com/products/4')
      expect(result.skip).toBe(true)
    })

    it('treats different path structures as different patterns', () => {
      detector.shouldSkipUrl('https://example.com/products/1')
      detector.shouldSkipUrl('https://example.com/products/2')
      detector.shouldSkipUrl('https://example.com/products/3')

      // Different pattern: /categories/:id
      const result = detector.shouldSkipUrl('https://example.com/categories/1')
      expect(result.skip).toBe(false)
    })
  })

  describe('isContentSimilar', () => {
    it('detects identical content', () => {
      const pageData = {
        title: 'Product Page',
        html: '<div>Product details here with enough content to pass min length threshold</div>',
        links: [{ href: '/home', text: 'Home' }],
        forms: [],
      }

      // First page — establishes fingerprint
      const first = detector.isContentSimilar('https://example.com/p/1', pageData)
      expect(first.similar).toBe(false)

      // Same content, different URL — exact hash match returns similar=true (no similarTo for hash match)
      const second = detector.isContentSimilar('https://example.com/p/2', pageData)
      expect(second.similar).toBe(true)
    })

    it('does not flag different content as similar', () => {
      detector.isContentSimilar('https://example.com/p/1', {
        title: 'Home Page',
        html: '<div>Welcome to our homepage with lots of unique content about the company</div>',
        links: [{ href: '/about', text: 'About' }],
        forms: [],
      })

      const result = detector.isContentSimilar('https://example.com/p/2', {
        title: 'Contact Page',
        html: '<div>Get in touch with us using our contact form below for support requests</div>',
        links: [{ href: '/products', text: 'Products' }, { href: '/faq', text: 'FAQ' }],
        forms: [{ action: '/submit', method: 'POST', inputs: [] }],
      })

      expect(result.similar).toBe(false)
    })
  })

  describe('isDiminishingReturns', () => {
    it('returns false when no pages processed', () => {
      expect(detector.isDiminishingReturns()).toBe(false)
    })
  })

  describe('statistics', () => {
    it('tracks patterns and fingerprints', () => {
      detector.shouldSkipUrl('https://example.com/p/1')
      detector.shouldSkipUrl('https://example.com/p/2')

      const stats = detector.getStatistics()
      expect(stats.totalPatterns).toBeGreaterThan(0)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      detector.shouldSkipUrl('https://example.com/p/1')
      detector.shouldSkipUrl('https://example.com/p/2')
      detector.reset()

      const stats = detector.getStatistics()
      expect(stats.totalPatterns).toBe(0)
      expect(stats.totalContentFingerprints).toBe(0)
    })
  })
})
