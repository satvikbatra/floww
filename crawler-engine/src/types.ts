/**
 * Core types for @floww/crawler-engine
 */

export interface CrawlRequest {
  id: string
  url: string
  depth: number
  retryCount: number
  maxRetries: number
  priority: number // lower = higher priority
  userData: Record<string, any>
  createdAt: Date
  parentUrl?: string
}

export interface PageData {
  url: string
  finalUrl: string
  title: string
  html: string
  httpStatus: number
  loadTimeMs: number
  links: Array<{ href: string; text: string }>
  forms: Array<{
    action: string
    method: string
    inputs: Array<{ name: string | null; type: string | null; required: boolean }>
  }>
  buttons: Array<{ text: string; type: string | null }>
  meta: Record<string, string>
  headings: Array<{ level: number; text: string }>
  isSPA: boolean
}

export interface CrawlResult {
  request: CrawlRequest
  pageData: PageData
  screenshot?: Buffer
  markdown?: string
  metadata: Record<string, any>
  enrichedDOM?: string
  processedAt: Date
}

export interface CrawlSummary {
  totalRequests: number
  successCount: number
  failedCount: number
  skippedCount: number
  durationMs: number
  pagesPerSecond: number
  startedAt: Date
  completedAt: Date
  statistics: CrawlStatisticsSnapshot
}

export interface CrawlStatisticsSnapshot {
  totalRequests: number
  successCount: number
  failedCount: number
  skippedCount: number
  retryCount: number
  avgProcessingTimeMs: number
  errorsByType: Record<string, number>
  requestsPerMinute: number
  startedAt: Date
  elapsedMs: number
}

export interface ObstacleInfo {
  type: 'login' | 'oauth' | 'captcha' | 'blocked' | '2fa' | 'form' | 'unknown'
  pageUrl: string
  pageTitle: string
  message: string
  oauthProviders?: string[]
}

// ── Enriched DOM (browser-use inspired) ─────────────────────────

export interface AXNodeInfo {
  role: string
  name: string
  description: string
  states: string[]
  value?: string
  backendDOMNodeId: number
}

export interface EnrichedElement {
  index: number
  tagName: string
  role: string
  name: string
  description: string
  states: string[]
  boundingBox: { x: number; y: number; width: number; height: number } | null
  isVisible: boolean
  isInteractive: boolean
  selector: string
  backendNodeId: number
  attributes: Record<string, string>
  innerText: string
  children: number[]
  parentIndex?: number
}

export interface IndexedDOM {
  elements: EnrichedElement[]
  textRepresentation: string
  stats: {
    totalElements: number
    interactiveElements: number
    visibleElements: number
    filteredElements: number
  }
}

// ── Watchdog system ─────────────────────────────────────────────

export interface WatchdogEvent {
  watchdog: string
  type: string
  timestamp: number
  data: Record<string, any>
}
