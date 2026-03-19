/**
 * Similarity Detector - Detects repetitive and similar URLs/content
 * 
 * Prevents crawling infinite pagination, galleries, and duplicate content
 */

export interface SimilarityConfig {
  maxSimilarUrlsPerPattern?: number;  // Max similar URLs to crawl per pattern (default: 3)
  contentSimilarityThreshold?: number; // 0-1, how similar content must be (default: 0.85)
  urlPatternSimilarityThreshold?: number; // 0-1, how similar URLs must be (default: 0.9)
  minContentLength?: number; // Min content length to compare (default: 100)
}

export interface URLPattern {
  pattern: string;
  baseUrl: string;
  count: number;
  urls: string[];
  firstSeen: Date;
  lastSeen: Date;
}

export interface ContentFingerprint {
  url: string;
  hash: string;
  titleHash: string;
  linkCount: number;
  formCount: number;
  textLength: number;
  timestamp: Date;
}

/**
 * SimilarityDetector - Detects when crawler is going in circles
 */
export class SimilarityDetector {
  private config: Required<SimilarityConfig>;
  private urlPatterns = new Map<string, URLPattern>();
  private contentFingerprints = new Map<string, ContentFingerprint>();
  private seenHashes = new Set<string>();

  constructor(config?: SimilarityConfig) {
    this.config = {
      maxSimilarUrlsPerPattern: config?.maxSimilarUrlsPerPattern ?? 3,
      contentSimilarityThreshold: config?.contentSimilarityThreshold ?? 0.85,
      urlPatternSimilarityThreshold: config?.urlPatternSimilarityThreshold ?? 0.9,
      minContentLength: config?.minContentLength ?? 100,
    };
  }

  /**
   * Check if URL should be skipped due to similarity
   */
  shouldSkipUrl(url: string): { skip: boolean; reason?: string } {
    // Extract URL pattern
    const pattern = this.extractUrlPattern(url);
    
    if (!pattern) {
      return { skip: false };
    }

    // Check if we've seen this pattern too many times
    const patternInfo = this.urlPatterns.get(pattern);
    
    if (patternInfo) {
      if (patternInfo.count >= this.config.maxSimilarUrlsPerPattern) {
        return {
          skip: true,
          reason: `Pattern '${pattern}' already crawled ${patternInfo.count} times. Skipping repetitive URL.`,
        };
      }
      
      // Update pattern
      patternInfo.count++;
      patternInfo.urls.push(url);
      patternInfo.lastSeen = new Date();
    } else {
      // New pattern
      this.urlPatterns.set(pattern, {
        pattern,
        baseUrl: this.getBaseUrl(url),
        count: 1,
        urls: [url],
        firstSeen: new Date(),
        lastSeen: new Date(),
      });
    }

    return { skip: false };
  }

  /**
   * Check if content is too similar to already seen content
   */
  isContentSimilar(
    url: string,
    pageData: {
      title: string;
      html?: string;
      links: any[];
      forms: any[];
    }
  ): { similar: boolean; reason?: string; similarTo?: string } {
    // Create content fingerprint
    const fingerprint = this.createContentFingerprint(url, pageData);
    
    // Check if we've seen this exact content hash
    if (this.seenHashes.has(fingerprint.hash)) {
      return {
        similar: true,
        reason: 'Identical content already seen',
      };
    }

    // Check against recent fingerprints
    for (const [existingUrl, existing] of this.contentFingerprints.entries()) {
      const similarity = this.calculateContentSimilarity(fingerprint, existing);
      
      if (similarity >= this.config.contentSimilarityThreshold) {
        return {
          similar: true,
          reason: `Content ${Math.round(similarity * 100)}% similar to already crawled page`,
          similarTo: existingUrl,
        };
      }
    }

    // Store fingerprint
    this.contentFingerprints.set(url, fingerprint);
    this.seenHashes.add(fingerprint.hash);

    // Cleanup old fingerprints (keep last 100)
    if (this.contentFingerprints.size > 100) {
      const oldest = Array.from(this.contentFingerprints.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())[0];
      this.contentFingerprints.delete(oldest[0]);
    }

    return { similar: false };
  }

  /**
   * Extract URL pattern (remove dynamic parts)
   * 
   * Examples:
   * /locations/UY/uruguay/:77 -> /locations/:country/:region/:id
   * /products/123 -> /products/:id
   * /posts?page=5 -> /posts?page=:num
   */
  private extractUrlPattern(url: string): string | null {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;

      // Normalize path patterns
      pathname = pathname
        // Replace numbers with :id
        .replace(/\/\d+/g, '/:id')
        // Replace UUIDs
        .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/:uuid')
        // Replace hashes
        .replace(/\/[a-f0-9]{32,}/gi, '/:hash')
        // Replace numbered suffixes like :77, :78
        .replace(/:\d+/g, '/:num');

      // Normalize query parameters
      const params = new URLSearchParams(urlObj.search);
      const normalizedParams: string[] = [];
      
      for (const [key, value] of params.entries()) {
        // Replace numeric values with :num
        if (/^\d+$/.test(value)) {
          normalizedParams.push(`${key}=:num`);
        } else if (value.length > 50) {
          // Long values are likely tokens/hashes
          normalizedParams.push(`${key}=:token`);
        } else {
          normalizedParams.push(`${key}=${value}`);
        }
      }

      const query = normalizedParams.length > 0 ? '?' + normalizedParams.sort().join('&') : '';

      return urlObj.origin + pathname + query;
    } catch {
      return null;
    }
  }

  /**
   * Get base URL (origin + first path segment)
   */
  private getBaseUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const firstSegment = urlObj.pathname.split('/').filter(Boolean)[0] || '';
      return urlObj.origin + '/' + firstSegment;
    } catch {
      return url;
    }
  }

  /**
   * Create content fingerprint for similarity comparison
   */
  private createContentFingerprint(
    url: string,
    pageData: {
      title: string;
      html?: string;
      links: any[];
      forms: any[];
    }
  ): ContentFingerprint {
    // Create hash from title + structure
    const titleHash = this.simpleHash(pageData.title);
    
    // Create hash from content structure (not full HTML to avoid minor differences)
    const structureHash = this.simpleHash(
      `links:${pageData.links.length}|forms:${pageData.forms.length}|title:${pageData.title}`
    );

    return {
      url,
      hash: structureHash,
      titleHash,
      linkCount: pageData.links.length,
      formCount: pageData.forms.length,
      textLength: pageData.html?.length || 0,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate similarity between two content fingerprints
   */
  private calculateContentSimilarity(
    fp1: ContentFingerprint,
    fp2: ContentFingerprint
  ): number {
    let similarity = 0;
    let weights = 0;

    // Title similarity (weight: 0.4)
    if (fp1.titleHash === fp2.titleHash) {
      similarity += 0.4;
    }
    weights += 0.4;

    // Structure similarity (weight: 0.3)
    const linkDiff = Math.abs(fp1.linkCount - fp2.linkCount);
    const formDiff = Math.abs(fp1.formCount - fp2.formCount);
    const structureSimilarity = 1 - Math.min(linkDiff + formDiff, 20) / 20;
    similarity += structureSimilarity * 0.3;
    weights += 0.3;

    // Content length similarity (weight: 0.3)
    const lengthDiff = Math.abs(fp1.textLength - fp2.textLength);
    const maxLength = Math.max(fp1.textLength, fp2.textLength);
    const lengthSimilarity = maxLength > 0 ? 1 - Math.min(lengthDiff / maxLength, 1) : 1;
    similarity += lengthSimilarity * 0.3;
    weights += 0.3;

    return weights > 0 ? similarity / weights : 0;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get statistics about detected patterns
   */
  getStatistics(): {
    totalPatterns: number;
    topPatterns: Array<{ pattern: string; count: number; urls: string[] }>;
    totalContentFingerprints: number;
    duplicatesDetected: number;
  } {
    const patterns = Array.from(this.urlPatterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((p) => ({
        pattern: p.pattern,
        count: p.count,
        urls: p.urls,
      }));

    const duplicatesDetected = Array.from(this.urlPatterns.values()).filter(
      (p) => p.count >= this.config.maxSimilarUrlsPerPattern
    ).length;

    return {
      totalPatterns: this.urlPatterns.size,
      topPatterns: patterns,
      totalContentFingerprints: this.contentFingerprints.size,
      duplicatesDetected,
    };
  }

  /**
   * Check if we're seeing diminishing returns
   * (lots of similar pages with no new content)
   */
  isDiminishingReturns(recentPageCount: number = 10): boolean {
    const recentFingerprints = Array.from(this.contentFingerprints.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, recentPageCount);

    if (recentFingerprints.length < recentPageCount) {
      return false; // Not enough data yet
    }

    // Check if recent pages are very similar to each other
    let similaritySum = 0;
    let comparisons = 0;

    for (let i = 0; i < recentFingerprints.length - 1; i++) {
      for (let j = i + 1; j < recentFingerprints.length; j++) {
        const similarity = this.calculateContentSimilarity(
          recentFingerprints[i],
          recentFingerprints[j]
        );
        similaritySum += similarity;
        comparisons++;
      }
    }

    const avgSimilarity = comparisons > 0 ? similaritySum / comparisons : 0;

    // If average similarity is very high, we're seeing diminishing returns
    return avgSimilarity > 0.8;
  }

  /**
   * Reset detector state
   */
  reset() {
    this.urlPatterns.clear();
    this.contentFingerprints.clear();
    this.seenHashes.clear();
  }
}
