import { z } from 'zod'

export const CrawlerConfigSchema = z.object({
  // Core
  maxPages: z.number().min(1).default(100),
  maxDepth: z.number().min(0).default(5),
  delayMs: z.number().min(0).default(1000),
  navigationTimeout: z.number().default(30000),

  // Queue backend
  queueBackend: z.enum(['redis', 'memory']).default('memory'),
  redisUrl: z.string().optional(),

  // Browser pool
  maxBrowsers: z.number().min(1).default(1),
  maxPagesPerBrowser: z.number().min(1).default(50),
  headless: z.boolean().default(true),
  useStealth: z.boolean().default(true),
  usePersistentProfile: z.boolean().default(false),
  userDataDir: z.string().optional(),

  // Concurrency & scaling
  maxConcurrency: z.number().min(1).default(1),
  maxConcurrentPerDomain: z.number().min(1).default(2),
  delayStrategy: z.enum(['per-request', 'per-domain']).default('per-request'),
  autoscale: z.boolean().default(false),
  maxCpuPercent: z.number().min(10).max(100).default(80),
  maxMemoryPercent: z.number().min(10).max(100).default(80),

  // Navigation strategy
  strategy: z.enum(['depth_only', 'same_domain', 'full']).default('same_domain'),
  includePatterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),

  // Similarity & dedup
  maxSimilarUrlsPerPattern: z.number().default(5),
  contentSimilarityThreshold: z.number().min(0).max(1).default(0.85),

  // Retry
  maxRetries: z.number().default(2),
  retryDelayMs: z.number().default(2000),
  maxErrorsBeforeStop: z.number().default(20),

  // Robots & sitemap
  respectRobotsTxt: z.boolean().default(true),
  useSitemap: z.boolean().default(true),

  // Content pipeline
  processors: z.array(z.string()).default(['link-extractor', 'metadata', 'screenshot']),

  // Proxy
  proxyUrl: z.string().optional(),
  proxies: z.array(z.object({
    url: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
  })).default([]),
  proxyRotation: z.enum(['round-robin', 'random', 'least-used']).default('round-robin'),
  maxProxyFailures: z.number().default(3),

  // Block detection
  enableBlockDetection: z.boolean().default(false),
  blockThreshold: z.number().default(5),
  adaptiveThrottling: z.boolean().default(false),

  // Checkpoints
  enableCheckpoints: z.boolean().default(false),
  checkpointIntervalPages: z.number().default(50),
  checkpointDir: z.string().optional(),

  // Session
  cookies: z.array(z.any()).optional(),
  userAgent: z.string().optional(),

  // Enriched DOM (browser-use inspired CDP features)
  enableEnrichedDOM: z.boolean().default(false),
  enrichedDOMOptions: z.object({
    includeNonInteractive: z.boolean().default(false),
    maxElements: z.number().default(500),
    filterOccluded: z.boolean().default(true),
    maxTextLength: z.number().default(100),
  }).default({}),

  // Watchdog system
  enableWatchdogs: z.boolean().default(false),
  watchdogs: z.array(z.enum([
    'popup', 'cookie-banner', 'challenge', 'dom-change', 'navigation',
  ])).default(['popup', 'cookie-banner', 'challenge']),
})

export type CrawlerConfig = z.infer<typeof CrawlerConfigSchema>
