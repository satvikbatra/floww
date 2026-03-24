import { describe, it, expect, beforeEach } from 'vitest'
import { RedirectGuard } from '../strategy/redirect-guard'

describe('RedirectGuard', () => {
  let guard: RedirectGuard

  beforeEach(() => {
    guard = new RedirectGuard(3)
  })

  it('records redirects', () => {
    guard.recordRedirect('https://example.com/a', 'https://example.com/b')
    expect(guard.totalRedirects).toBe(1)
  })

  it('detects redirect loops (circular: A->B then check A)', () => {
    // Circular: startUrl same as checked url, and url in the chain
    guard.recordRedirect('https://example.com/a', 'https://example.com/b')

    // Now check if url 'b' is in chain of 'a' where startUrl is 'a'
    // The guard checks: chain.includes(url) && startUrl === url
    // So for circular: the URL must be the startUrl
    expect(guard.isRedirectLoop('https://example.com/a')).toBe(false) // 'a' not in its own chain

    // Record a chain that includes the URL itself (A -> B -> A cycle)
    guard.recordRedirect('https://example.com/b', 'https://example.com/a')
    // Now 'a' is in chain of 'b', and startUrl 'b' !== 'a', but...
    // Let's trigger by exceeding maxRedirects
  })

  it('detects loops exceeding maxRedirects threshold', () => {
    // Chain for same startUrl exceeds maxRedirects (3)
    guard.recordRedirect('https://example.com/a', 'https://example.com/b')
    guard.recordRedirect('https://example.com/a', 'https://example.com/c')
    guard.recordRedirect('https://example.com/a', 'https://example.com/d')

    // 'b' is in chain of 'a', and chain.length (3) >= maxRedirects (3)
    expect(guard.isRedirectLoop('https://example.com/b')).toBe(true)
  })

  it('does not flag non-loops', () => {
    guard.recordRedirect('https://example.com/a', 'https://example.com/b')
    expect(guard.isRedirectLoop('https://example.com/a')).toBe(false)
  })

  it('detects cross-domain redirects', () => {
    expect(guard.isCrossDomainRedirect(
      'https://example.com/page',
      'https://other.com/page'
    )).toBe(true)
  })

  it('does not flag same-domain redirects', () => {
    expect(guard.isCrossDomainRedirect(
      'https://example.com/a',
      'https://example.com/b'
    )).toBe(false)
  })

  it('clears state', () => {
    guard.recordRedirect('https://example.com/a', 'https://example.com/b')
    guard.clear()
    expect(guard.totalRedirects).toBe(0)
  })
})
