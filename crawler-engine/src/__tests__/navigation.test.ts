import { describe, it, expect } from 'vitest'
import { URLNavigator, NavigationStrategy, createDepthOnlyNavigator, createSameDomainNavigator } from '../strategy/navigation'

describe('URLNavigator', () => {
  describe('SAME_DOMAIN strategy', () => {
    const nav = new URLNavigator({
      strategy: NavigationStrategy.SAME_DOMAIN,
      baseUrl: 'https://example.com/docs',
    })

    it('allows same-domain URLs', () => {
      expect(nav.shouldCrawl('https://example.com/about')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/docs/getting-started')).toBe(true)
    })

    it('rejects different domains', () => {
      expect(nav.shouldCrawl('https://other.com/page')).toBe(false)
      expect(nav.shouldCrawl('https://sub.example.com/page')).toBe(false)
    })

    it('rejects invalid URLs', () => {
      expect(nav.shouldCrawl('')).toBe(false)
      expect(nav.shouldCrawl('not-a-url')).toBe(false)
      expect(nav.shouldCrawl('javascript:void(0)')).toBe(false)
      expect(nav.shouldCrawl('mailto:test@test.com')).toBe(false)
    })

    it('provides reasons for rejection', () => {
      const result = nav.shouldCrawlWithReason('https://other.com/page')
      expect(result.shouldCrawl).toBe(false)
      expect(result.reason).toBeDefined()
    })
  })

  describe('DEPTH_ONLY strategy', () => {
    const nav = new URLNavigator({
      strategy: NavigationStrategy.DEPTH_ONLY,
      baseUrl: 'https://example.com/docs',
      maxDepth: 3,
    })

    it('allows deeper paths under base', () => {
      expect(nav.shouldCrawl('https://example.com/docs/guide')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/docs/guide/install')).toBe(true)
    })

    it('rejects sibling paths', () => {
      expect(nav.shouldCrawl('https://example.com/about')).toBe(false)
      expect(nav.shouldCrawl('https://example.com/blog/post')).toBe(false)
    })

    it('rejects URLs beyond maxDepth', () => {
      expect(nav.shouldCrawl('https://example.com/docs/a/b/c/d/e')).toBe(false)
    })
  })

  describe('FULL strategy', () => {
    const nav = new URLNavigator({
      strategy: NavigationStrategy.FULL,
      baseUrl: 'https://example.com',
    })

    it('allows any valid URL', () => {
      expect(nav.shouldCrawl('https://other.com/page')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/about')).toBe(true)
    })

    it('still rejects invalid URLs', () => {
      expect(nav.shouldCrawl('javascript:void(0)')).toBe(false)
      expect(nav.shouldCrawl('mailto:a@b.com')).toBe(false)
    })
  })

  describe('include/exclude patterns', () => {
    it('includes only matching patterns', () => {
      const nav = new URLNavigator({
        strategy: NavigationStrategy.SAME_DOMAIN,
        baseUrl: 'https://example.com',
        includePatterns: ['/docs/', '/api/'],
      })

      expect(nav.shouldCrawl('https://example.com/docs/page')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/api/v1')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/blog/post')).toBe(false)
    })

    it('excludes matching patterns', () => {
      const nav = new URLNavigator({
        strategy: NavigationStrategy.SAME_DOMAIN,
        baseUrl: 'https://example.com',
        excludePatterns: ['/admin/', '/private/'],
      })

      expect(nav.shouldCrawl('https://example.com/about')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/admin/dashboard')).toBe(false)
      expect(nav.shouldCrawl('https://example.com/private/data')).toBe(false)
    })
  })

  describe('getRelativeDepth', () => {
    const nav = new URLNavigator({
      strategy: NavigationStrategy.SAME_DOMAIN,
      baseUrl: 'https://example.com/docs',
    })

    it('calculates depth relative to base', () => {
      expect(nav.getRelativeDepth('https://example.com/docs')).toBe(0)
      expect(nav.getRelativeDepth('https://example.com/docs/guide')).toBe(1)
      expect(nav.getRelativeDepth('https://example.com/docs/guide/install')).toBe(2)
    })
  })

  describe('factory functions', () => {
    it('createDepthOnlyNavigator works', () => {
      const nav = createDepthOnlyNavigator('https://example.com/docs', 2)
      expect(nav.shouldCrawl('https://example.com/docs/guide')).toBe(true)
      expect(nav.shouldCrawl('https://example.com/about')).toBe(false)
    })

    it('createSameDomainNavigator works', () => {
      const nav = createSameDomainNavigator('https://example.com')
      expect(nav.shouldCrawl('https://example.com/about')).toBe(true)
      expect(nav.shouldCrawl('https://other.com/page')).toBe(false)
    })
  })
})
