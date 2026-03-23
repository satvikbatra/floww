/**
 * robots.txt parser and compliance checker
 */

export class RobotsParser {
  private rules: Array<{ path: string; allow: boolean }> = []
  private sitemapUrls: string[] = []
  private crawlDelay: number | null = null
  private loaded = false

  async fetch(baseUrl: string, userAgent: string = '*'): Promise<void> {
    try {
      const url = new URL('/robots.txt', baseUrl).toString()
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        this.loaded = true
        return // No robots.txt = allow all
      }

      const text = await response.text()
      this.parse(text, userAgent)
      this.loaded = true
    } catch {
      this.loaded = true // Fail open — allow all if robots.txt is unreachable
    }
  }

  isAllowed(url: string): boolean {
    if (!this.loaded || this.rules.length === 0) return true

    try {
      const pathname = new URL(url).pathname
      // Check rules in order, most specific match wins
      let allowed = true
      for (const rule of this.rules) {
        if (pathname.startsWith(rule.path)) {
          allowed = rule.allow
        }
      }
      return allowed
    } catch {
      return true
    }
  }

  getCrawlDelay(): number | null {
    return this.crawlDelay
  }

  getSitemapUrls(): string[] {
    return this.sitemapUrls
  }

  private parse(text: string, targetAgent: string): void {
    const lines = text.split('\n').map(l => l.trim())
    let isRelevantBlock = false
    let hasSeenTargetBlock = false

    for (const line of lines) {
      // Skip comments and empty
      if (line.startsWith('#') || line === '') continue

      const [directive, ...valueParts] = line.split(':')
      const key = directive.trim().toLowerCase()
      const value = valueParts.join(':').trim()

      if (key === 'user-agent') {
        const agent = value.toLowerCase()
        isRelevantBlock = agent === '*' || agent === targetAgent.toLowerCase()
        if (isRelevantBlock) hasSeenTargetBlock = true
        continue
      }

      if (!isRelevantBlock) continue

      if (key === 'disallow' && value) {
        this.rules.push({ path: value, allow: false })
      } else if (key === 'allow' && value) {
        this.rules.push({ path: value, allow: true })
      } else if (key === 'crawl-delay') {
        const delay = parseFloat(value)
        if (!isNaN(delay)) this.crawlDelay = delay * 1000 // convert to ms
      } else if (key === 'sitemap') {
        this.sitemapUrls.push(value)
      }
    }

    // Sort rules by path length (longer = more specific = higher priority)
    this.rules.sort((a, b) => a.path.length - b.path.length)
  }
}
