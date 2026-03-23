import crypto from 'crypto'
import type { CrawlRequest } from '../types'

export function createRequest(
  url: string,
  options?: Partial<Pick<CrawlRequest, 'depth' | 'priority' | 'userData' | 'parentUrl' | 'maxRetries'>>
): CrawlRequest {
  return {
    id: crypto.randomUUID(),
    url: normalizeUrl(url),
    depth: options?.depth ?? 0,
    retryCount: 0,
    maxRetries: options?.maxRetries ?? 2,
    priority: options?.priority ?? 10,
    userData: options?.userData ?? {},
    createdAt: new Date(),
    parentUrl: options?.parentUrl,
  }
}

// Tracking parameters to strip from URLs
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'twclid', 'li_fat_id',
  '_ga', '_gl', '_hsenc', '_hsmi',
  'mc_cid', 'mc_eid',
  'oly_anon_id', 'oly_enc_id',
  'vero_id', 'rb_clickid',
  'ref', 'source', 'spm', 'pvid',
  '__hstc', '__hssc', '__hsfp',
  'trk', 'trkCampaign', 'trkInfo',
  'sc_campaign', 'sc_channel', 'sc_content', 'sc_country', 'sc_geo', 'sc_outcome',
])

// Session-like parameters to strip
const SESSION_PARAMS = new Set([
  'sid', 'session_id', 'sessionid', 'PHPSESSID', 'jsessionid',
  'token', 'auth', 'nonce', 'timestamp', 'ts', '_t', 'cb',
  '_dc', '_', 'nocache', 'rand', 'random',
])

/**
 * Normalize URL for deduplication:
 * - Strip fragments
 * - Sort query params
 * - Remove tracking params (utm_*, fbclid, gclid, etc.)
 * - Remove session params
 * - Remove trailing slash
 * - Lowercase scheme + host
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)

    // Remove fragment
    u.hash = ''

    // Strip tracking and session params
    const params = new URLSearchParams(u.search)
    const cleaned = new URLSearchParams()
    for (const [key, value] of params.entries()) {
      const lowerKey = key.toLowerCase()
      if (TRACKING_PARAMS.has(lowerKey)) continue
      if (SESSION_PARAMS.has(lowerKey)) continue
      cleaned.append(key, value)
    }

    // Sort remaining params for consistent dedup
    const sorted = new URLSearchParams([...cleaned.entries()].sort())
    u.search = sorted.toString()

    // Remove trailing slash (except for root)
    let result = u.toString()
    if (result.endsWith('/') && u.pathname !== '/') {
      result = result.slice(0, -1)
    }

    return result
  } catch {
    return url
  }
}

/**
 * Check if URL is a likely pagination URL
 */
export function isPaginationUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    const search = u.search.toLowerCase()

    // Path-based pagination: /page/5, /p/10
    if (/\/page\/\d+/.test(path)) return true
    if (/\/p\/\d+/.test(path)) return true

    // Query-based pagination: ?page=5, ?p=10, ?offset=20
    if (/[?&](page|p|pg|offset|start|skip|from|cursor)=\d+/.test(search)) return true

    return false
  } catch {
    return false
  }
}

/**
 * Extract canonical URL from page if present
 */
export function extractCanonicalUrl(html: string, currentUrl: string): string | null {
  // Match <link rel="canonical" href="...">
  const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)

  if (match?.[1]) {
    try {
      // Resolve relative URLs
      return new URL(match[1], currentUrl).toString()
    } catch {
      return null
    }
  }
  return null
}

/**
 * Detect if URL is likely a redirect loop target
 */
export function isRedirectUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const search = u.search.toLowerCase()
    const path = u.pathname.toLowerCase()

    // Common redirect patterns
    if (/[?&](redirect|return|next|continue|goto|url|target|dest|destination)=/.test(search)) return true
    if (path.includes('/redirect') || path.includes('/goto') || path.includes('/bounce')) return true

    return false
  } catch {
    return false
  }
}
