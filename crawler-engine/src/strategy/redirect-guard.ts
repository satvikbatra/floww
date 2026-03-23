/**
 * Redirect Guard — Detects and prevents redirect loops
 *
 * Tracks redirect chains per URL and stops crawling if a loop is detected.
 */

export class RedirectGuard {
  private redirectChains = new Map<string, string[]>() // startUrl -> [redirect1, redirect2, ...]
  private maxRedirects: number

  constructor(maxRedirects: number = 5) {
    this.maxRedirects = maxRedirects
  }

  /**
   * Record a redirect: startUrl was redirected to finalUrl
   */
  recordRedirect(startUrl: string, finalUrl: string): void {
    if (startUrl === finalUrl) return

    const chain = this.redirectChains.get(startUrl) || []
    chain.push(finalUrl)
    this.redirectChains.set(startUrl, chain)
  }

  /**
   * Check if following this URL would cause a redirect loop
   */
  isRedirectLoop(url: string): boolean {
    // Check if this URL appears in any existing redirect chain
    for (const [startUrl, chain] of this.redirectChains) {
      if (chain.includes(url) && chain.length >= this.maxRedirects) {
        return true
      }
      // Check for circular redirects: A -> B -> A
      if (chain.includes(url) && startUrl === url) {
        return true
      }
    }
    return false
  }

  /**
   * Check if a URL redirected to a different domain (possible session/login redirect)
   */
  isCrossDomainRedirect(startUrl: string, finalUrl: string): boolean {
    try {
      const startDomain = new URL(startUrl).hostname
      const finalDomain = new URL(finalUrl).hostname
      return startDomain !== finalDomain
    } catch {
      return false
    }
  }

  get totalRedirects(): number {
    let count = 0
    for (const chain of this.redirectChains.values()) {
      count += chain.length
    }
    return count
  }

  clear(): void {
    this.redirectChains.clear()
  }
}
