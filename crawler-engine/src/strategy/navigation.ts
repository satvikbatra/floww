/**
 * URL Navigation Strategy
 * 
 * Implements different crawling strategies:
 * - DEPTH_ONLY: Only go deeper from base URL (never go up in hierarchy)
 * - SAME_DOMAIN: All URLs on same domain
 * - FULL: Follow all links including external
 */

export enum NavigationStrategy {
  DEPTH_ONLY = 'depth_only',     // Only crawl URLs deeper than base URL
  SAME_DOMAIN = 'same_domain',   // Crawl entire domain
  FULL = 'full',                 // Follow all links
}

export interface URLNavigationConfig {
  strategy: NavigationStrategy;
  baseUrl: string;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

/**
 * URLNavigator - Decides which URLs to crawl based on strategy
 */
export class URLNavigator {
  private baseUrl: URL;
  private config: URLNavigationConfig;

  constructor(config: URLNavigationConfig) {
    this.config = config;
    this.baseUrl = new URL(config.baseUrl);
  }

  /**
   * Check if URL should be crawled with detailed reason
   */
  shouldCrawlWithReason(url: string): { shouldCrawl: boolean; reason?: string } {
    try {
      const targetUrl = new URL(url);

      // Basic checks
      if (!this.isHttpProtocol(targetUrl)) {
        return { shouldCrawl: false, reason: 'not HTTP/HTTPS protocol' };
      }
      if (this.isExcluded(url)) {
        return { shouldCrawl: false, reason: 'matches exclude pattern' };
      }
      if (!this.matchesIncludePattern(url)) {
        return { shouldCrawl: false, reason: 'does not match include pattern' };
      }

      // Strategy-specific checks
      switch (this.config.strategy) {
        case NavigationStrategy.DEPTH_ONLY:
          if (!this.isSameDomain(targetUrl)) {
            return { shouldCrawl: false, reason: 'different domain' };
          }
          if (!this.isDeeper(targetUrl)) {
            return { shouldCrawl: false, reason: 'not deeper than base path' };
          }
          return { shouldCrawl: true };
        
        case NavigationStrategy.SAME_DOMAIN:
          if (!this.isSameDomain(targetUrl)) {
            return { shouldCrawl: false, reason: 'different domain (origin)' };
          }
          return { shouldCrawl: true };
        
        case NavigationStrategy.FULL:
          return { shouldCrawl: true };
        
        default:
          return { shouldCrawl: false, reason: 'unknown strategy' };
      }
    } catch (error) {
      // Invalid URL
      return { shouldCrawl: false, reason: 'invalid URL format' };
    }
  }

  /**
   * Check if URL should be crawled
   */
  shouldCrawl(url: string): boolean {
    return this.shouldCrawlWithReason(url).shouldCrawl;
  }

  /**
   * Check if target URL is deeper than base URL (or is the base URL itself)
   * Only allows navigation "down" in the path hierarchy, never "up"
   * 
   * Examples:
   * Base: https://example.com/products
   * ✓ https://example.com/products (base URL itself - always allowed)
   * ✓ https://example.com/products/laptops (deeper)
   * ✓ https://example.com/products/phones/iphone (deeper)
   * ✗ https://example.com/ (shallower)
   * ✗ https://example.com/about (different branch)
   */
  private isDeeper(targetUrl: URL): boolean {
    // Must be same origin
    if (targetUrl.origin !== this.baseUrl.origin) {
      return false;
    }

    // Normalize paths (remove trailing slashes)
    const basePath = this.normalizePath(this.baseUrl.pathname);
    const targetPath = this.normalizePath(targetUrl.pathname);

    // Target must start with base path
    if (!targetPath.startsWith(basePath)) {
      return false;
    }

    // If same path, ALLOW IT (base URL should always be crawled)
    if (targetPath === basePath) {
      return true; // Base URL itself
    }

    // Calculate depth difference
    const baseDepth = this.getPathDepth(basePath);
    const targetDepth = this.getPathDepth(targetPath);

    // Check max depth if specified
    if (this.config.maxDepth !== undefined) {
      const depthFromBase = targetDepth - baseDepth;
      if (depthFromBase > this.config.maxDepth) {
        return false;
      }
    }

    return targetDepth > baseDepth;
  }

  /**
   * Check if URL is on same domain
   */
  private isSameDomain(targetUrl: URL): boolean {
    return targetUrl.origin === this.baseUrl.origin;
  }

  /**
   * Check if URL uses HTTP/HTTPS protocol
   */
  private isHttpProtocol(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  /**
   * Check if URL matches exclude patterns
   */
  private isExcluded(url: string): boolean {
    if (!this.config.excludePatterns || this.config.excludePatterns.length === 0) {
      return false;
    }

    return this.config.excludePatterns.some(pattern => {
      try {
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          const regex = new RegExp(pattern.slice(1, -1));
          return regex.test(url);
        } else {
          return url.includes(pattern);
        }
      } catch {
        // Invalid regex pattern — treat as simple string match
        return url.includes(pattern);
      }
    });
  }

  /**
   * Check if URL matches include patterns
   * If no patterns specified, return true
   */
  private matchesIncludePattern(url: string): boolean {
    if (!this.config.includePatterns || this.config.includePatterns.length === 0) {
      return true;
    }

    return this.config.includePatterns.some(pattern => {
      try {
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          const regex = new RegExp(pattern.slice(1, -1));
          return regex.test(url);
        } else {
          return url.includes(pattern);
        }
      } catch {
        // Invalid regex pattern — treat as simple string match
        return url.includes(pattern);
      }
    });
  }

  /**
   * Normalize path by removing trailing slash
   */
  private normalizePath(path: string): string {
    if (path === '/') return '/';
    return path.endsWith('/') ? path.slice(0, -1) : path;
  }

  /**
   * Get path depth (number of segments)
   */
  private getPathDepth(path: string): number {
    const normalized = this.normalizePath(path);
    if (normalized === '/') return 0;
    return normalized.split('/').filter(segment => segment.length > 0).length;
  }

  /**
   * Get relative depth from base URL
   */
  getRelativeDepth(url: string): number {
    try {
      const targetUrl = new URL(url);
      const basePath = this.normalizePath(this.baseUrl.pathname);
      const targetPath = this.normalizePath(targetUrl.pathname);
      
      const baseDepth = this.getPathDepth(basePath);
      const targetDepth = this.getPathDepth(targetPath);
      
      return targetDepth - baseDepth;
    } catch {
      return -1;
    }
  }

  /**
   * Get visualization of URL hierarchy
   */
  visualizeHierarchy(urls: string[]): string {
    const tree: string[] = [];
    tree.push(`Base: ${this.baseUrl.href}`);
    tree.push('');

    urls.forEach(url => {
      const depth = this.getRelativeDepth(url);
      const allowed = this.shouldCrawl(url);
      const indent = '  '.repeat(Math.max(0, depth));
      const symbol = allowed ? '✓' : '✗';
      
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        tree.push(`${indent}${symbol} ${path}`);
      } catch {
        tree.push(`${indent}${symbol} ${url}`);
      }
    });

    return tree.join('\n');
  }
}

/**
 * Helper function to create default depth-only navigator
 */
export function createDepthOnlyNavigator(baseUrl: string, maxDepth?: number): URLNavigator {
  return new URLNavigator({
    strategy: NavigationStrategy.DEPTH_ONLY,
    baseUrl,
    maxDepth,
  });
}

/**
 * Helper function to create same-domain navigator
 */
export function createSameDomainNavigator(baseUrl: string): URLNavigator {
  return new URLNavigator({
    strategy: NavigationStrategy.SAME_DOMAIN,
    baseUrl,
  });
}
