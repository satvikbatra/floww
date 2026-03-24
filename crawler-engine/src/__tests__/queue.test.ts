import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryQueue } from '../queue/memory-queue'
import { createRequest, normalizeUrl, isPaginationUrl, isRedirectUrl } from '../queue/request'

describe('MemoryQueue', () => {
  let queue: MemoryQueue

  beforeEach(() => {
    queue = new MemoryQueue()
  })

  describe('add/fetchNext', () => {
    it('adds and retrieves requests', async () => {
      const req = createRequest('https://example.com/page')
      await queue.add(req)

      expect(await queue.size()).toBe(1)
      expect(await queue.isEmpty()).toBe(false)

      const fetched = await queue.fetchNext()
      expect(fetched).toBeDefined()
      expect(fetched!.url).toBe(req.url)
    })

    it('returns null when empty', async () => {
      const fetched = await queue.fetchNext()
      expect(fetched).toBeNull()
    })

    it('respects priority order (lower = higher priority)', async () => {
      await queue.add(createRequest('https://example.com/low', { priority: 10 }))
      await queue.add(createRequest('https://example.com/high', { priority: 1 }))
      await queue.add(createRequest('https://example.com/mid', { priority: 5 }))

      const first = await queue.fetchNext()
      expect(first!.url).toContain('/high')

      const second = await queue.fetchNext()
      expect(second!.url).toContain('/mid')

      const third = await queue.fetchNext()
      expect(third!.url).toContain('/low')
    })
  })

  describe('deduplication', () => {
    it('rejects duplicate URLs', async () => {
      const req = createRequest('https://example.com/page')
      const added1 = await queue.add(req)
      const added2 = await queue.add(createRequest('https://example.com/page'))

      expect(added1).toBe(true)
      expect(added2).toBe(false)
      expect(await queue.size()).toBe(1)
    })

    it('normalizes URLs for dedup', async () => {
      await queue.add(createRequest('https://example.com/page#section'))
      const added = await queue.add(createRequest('https://example.com/page'))

      expect(added).toBe(false) // same after normalization
    })
  })

  describe('addMany', () => {
    it('adds multiple requests and returns count', async () => {
      const requests = [
        createRequest('https://example.com/a'),
        createRequest('https://example.com/b'),
        createRequest('https://example.com/c'),
      ]

      const count = await queue.addMany(requests)
      expect(count).toBe(3)
      expect(await queue.size()).toBe(3)
    })
  })

  describe('has', () => {
    it('checks if URL is queued', async () => {
      await queue.add(createRequest('https://example.com/page'))
      expect(await queue.has('https://example.com/page')).toBe(true)
      expect(await queue.has('https://example.com/other')).toBe(false)
    })
  })

  describe('markHandled/markFailed', () => {
    it('tracks handled count', async () => {
      const req = createRequest('https://example.com/page')
      await queue.add(req)
      const fetched = await queue.fetchNext()
      await queue.markHandled(fetched!.id)

      expect(await queue.handledCount()).toBe(1)
    })
  })

  describe('clear', () => {
    it('empties the queue', async () => {
      await queue.add(createRequest('https://example.com/a'))
      await queue.add(createRequest('https://example.com/b'))
      await queue.clear()

      expect(await queue.isEmpty()).toBe(true)
      expect(await queue.size()).toBe(0)
    })
  })
})

describe('createRequest', () => {
  it('creates a request with defaults', () => {
    const req = createRequest('https://example.com/page')
    expect(req.url).toBe('https://example.com/page')
    expect(req.depth).toBe(0)
    expect(req.retryCount).toBe(0)
    expect(req.priority).toBe(10)
    expect(req.id).toBeDefined()
    expect(req.createdAt).toBeInstanceOf(Date)
  })

  it('accepts custom options', () => {
    const req = createRequest('https://example.com/page', {
      depth: 3,
      priority: 5,
      parentUrl: 'https://example.com',
      maxRetries: 5,
    })
    expect(req.depth).toBe(3)
    expect(req.priority).toBe(5)
    expect(req.parentUrl).toBe('https://example.com')
    expect(req.maxRetries).toBe(5)
  })
})

describe('normalizeUrl', () => {
  it('removes fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page')
  })

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page')
  })

  it('removes tracking params', () => {
    const url = normalizeUrl('https://example.com/page?utm_source=google&utm_medium=cpc&q=test')
    expect(url).not.toContain('utm_source')
    expect(url).not.toContain('utm_medium')
    expect(url).toContain('q=test')
  })

  it('sorts query params', () => {
    const url = normalizeUrl('https://example.com/page?z=1&a=2')
    expect(url).toBe('https://example.com/page?a=2&z=1')
  })
})

describe('isPaginationUrl', () => {
  it('detects pagination patterns', () => {
    expect(isPaginationUrl('https://example.com/blog/page/2')).toBe(true)
    expect(isPaginationUrl('https://example.com/search?page=3')).toBe(true)
    expect(isPaginationUrl('https://example.com/items?offset=20')).toBe(true)
  })

  it('does not flag non-pagination URLs', () => {
    expect(isPaginationUrl('https://example.com/about')).toBe(false)
    expect(isPaginationUrl('https://example.com/blog/my-post')).toBe(false)
  })
})

describe('isRedirectUrl', () => {
  it('detects redirect patterns in query params', () => {
    expect(isRedirectUrl('https://example.com/auth?redirect=https://other.com')).toBe(true)
    expect(isRedirectUrl('https://example.com/login?next=/dashboard')).toBe(true)
    expect(isRedirectUrl('https://example.com/sso?goto=/app')).toBe(true)
  })

  it('detects redirect patterns in path', () => {
    expect(isRedirectUrl('https://example.com/redirect/target')).toBe(true)
    expect(isRedirectUrl('https://example.com/goto/page')).toBe(true)
  })

  it('does not flag normal URLs', () => {
    expect(isRedirectUrl('https://example.com/about')).toBe(false)
  })
})
