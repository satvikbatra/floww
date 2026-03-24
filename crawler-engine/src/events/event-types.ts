export const CrawlEvent = {
  PAGE_CRAWLED: 'page:crawled',
  PAGE_FAILED: 'page:failed',
  PAGE_SKIPPED: 'page:skipped',
  CRAWL_STARTED: 'crawl:started',
  CRAWL_PROGRESS: 'crawl:progress',
  CRAWL_COMPLETED: 'crawl:completed',
  CRAWL_ERROR: 'crawl:error',
  INTERACTION_NEEDED: 'interaction:needed',
  STATS_UPDATE: 'stats:update',
  BLOCK_DETECTED: 'block:detected',
  CHECKPOINT_SAVED: 'checkpoint:saved',
} as const

export type CrawlEventName = typeof CrawlEvent[keyof typeof CrawlEvent]
