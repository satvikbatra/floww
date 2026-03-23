/**
 * XML Sitemap parser — discovers URLs from sitemaps and sitemap indexes
 */

import * as cheerio from 'cheerio'

export interface SitemapEntry {
  url: string
  lastmod?: Date
  changefreq?: string
  priority?: number
}

export class SitemapParser {
  /**
   * Discover and parse sitemaps for a domain
   */
  async discover(baseUrl: string, sitemapUrls?: string[]): Promise<SitemapEntry[]> {
    const urls = sitemapUrls || []

    // Try common sitemap locations if none provided
    if (urls.length === 0) {
      urls.push(
        new URL('/sitemap.xml', baseUrl).toString(),
        new URL('/sitemap_index.xml', baseUrl).toString(),
        new URL('/sitemap/', baseUrl).toString(),
      )
    }

    const entries: SitemapEntry[] = []
    const seen = new Set<string>()

    for (const sitemapUrl of urls) {
      try {
        const found = await this.parse(sitemapUrl)
        for (const entry of found) {
          if (!seen.has(entry.url)) {
            seen.add(entry.url)
            entries.push(entry)
          }
        }
      } catch {
        // Sitemap doesn't exist or is malformed, skip
      }
    }

    return entries
  }

  /**
   * Parse a single sitemap URL (handles both sitemaps and sitemap indexes)
   */
  async parse(sitemapUrl: string): Promise<SitemapEntry[]> {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'FlowwCrawler/1.0' },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) return []

    const text = await response.text()
    const $ = cheerio.load(text, { xmlMode: true })

    // Check if this is a sitemap index
    const sitemapIndexUrls = $('sitemapindex sitemap loc').map((_, el) => $(el).text().trim()).get()
    if (sitemapIndexUrls.length > 0) {
      // Recursively parse sub-sitemaps (limit to first 10 to avoid infinite recursion)
      const entries: SitemapEntry[] = []
      for (const subUrl of sitemapIndexUrls.slice(0, 10)) {
        try {
          const subEntries = await this.parse(subUrl)
          entries.push(...subEntries)
        } catch {
          // Skip failed sub-sitemaps
        }
      }
      return entries
    }

    // Regular sitemap
    const entries: SitemapEntry[] = []
    $('urlset url').each((_, el) => {
      const loc = $(el).find('loc').text().trim()
      if (!loc) return

      const lastmodStr = $(el).find('lastmod').text().trim()
      const changefreq = $(el).find('changefreq').text().trim() || undefined
      const priorityStr = $(el).find('priority').text().trim()

      entries.push({
        url: loc,
        lastmod: lastmodStr ? new Date(lastmodStr) : undefined,
        changefreq,
        priority: priorityStr ? parseFloat(priorityStr) : undefined,
      })
    })

    return entries
  }
}
