// Main crawler
export { FlowwCrawler } from './crawler'

// Configuration
export { CrawlerConfigSchema, type CrawlerConfig } from './config'

// Types
export type { CrawlRequest, CrawlResult, CrawlSummary, PageData, CrawlStatisticsSnapshot, ObstacleInfo, AXNodeInfo, EnrichedElement, IndexedDOM, WatchdogEvent } from './types'

// Events
export { CrawlEvent } from './events/event-types'
export type { CrawlEventName } from './events/event-types'

// Strategy
export { URLNavigator, NavigationStrategy } from './strategy/navigation'
export { SimilarityDetector } from './strategy/similarity'
export { RobotsParser } from './strategy/robots'
export { SitemapParser } from './strategy/sitemap'

// Pipeline
export type { IContentProcessor, ProcessorContext } from './pipeline/processor-interface'
export { ContentPipeline } from './pipeline/content-pipeline'
export { ScreenshotProcessor } from './pipeline/processors/screenshot-capture'
export { MetadataProcessor } from './pipeline/processors/metadata-extractor'
export { LinkExtractorProcessor } from './pipeline/processors/link-extractor'
export { HtmlCleanerProcessor } from './pipeline/processors/html-cleaner'
export { MarkdownProcessor } from './pipeline/processors/markdown-converter'
export { DOMEnricherProcessor } from './pipeline/processors/dom-enricher'

// Browser
export { BrowserPool } from './browser/browser-pool'
export { BrowserInstance } from './browser/browser-instance'
export { StealthBrowserLauncher } from './browser/stealth'
export { navigateAndWait, extractPageData, detectObstacle, takeScreenshot } from './browser/page-handler'
export { discoverRoutesFromDOM, discoverRoutesByClicking, scrollToLoadContent } from './browser/spa-navigator'
export { dismissCookieBanner } from './browser/cookie-banner'
export { dismissPopups } from './browser/popup-dismisser'
export { installResourceBlocker } from './browser/resource-blocker'
export { submitGetForms } from './browser/form-submitter'
export { checkSessionStatus, detectAuthCookies, saveCookies, restoreCookies } from './browser/session-guard'
export { handleChallenge, handleMetaRefresh, waitForJsRedirect } from './browser/challenge-handler'
export { extractShadowDOMContent, extractIframeLinks, detectHashRoutes, extractCanonicalUrl as extractCanonicalUrlFromPage, detectHreflangUrls, detectPagination } from './browser/content-extractor'
export { getCDPSession, disposeCDPSession } from './browser/cdp-session'
export { fetchAccessibilityTree, buildAXNodeMap } from './browser/accessibility-tree'
export { indexPageElements, serializeIndexedDOM } from './browser/dom-indexer'
export { checkVisibility } from './browser/visibility-filter'
export { Watchdog, WatchdogManager, type WatchdogName, type WatchdogHandler } from './browser/watchdog'
export { RedirectGuard } from './strategy/redirect-guard'
export { isPaginationUrl, extractCanonicalUrl as extractCanonicalUrlFromHtml } from './queue/request'

// Hooks
export type { HookName, HookContext, HookFn } from './hooks/types'
export { HookManager } from './hooks/hook-manager'

// Queue
export type { IRequestQueue } from './queue/queue-interface'
export { MemoryQueue } from './queue/memory-queue'
export { RedisQueue } from './queue/redis-queue'
export { createRequest, normalizeUrl } from './queue/request'

// Stats
export { CrawlStatistics } from './stats/statistics'
export { ErrorTracker } from './stats/error-tracker'

// Scaling
export { Autoscaler } from './scaling/autoscaler'
export { SystemMonitor } from './scaling/system-monitor'

// Session
export { Session } from './session/session'
export { SessionPool } from './session/session-pool'

// Retry
export { RetryHandler } from './retry/retry-handler'

// Proxy
export { ProxyRotator, type ProxyConfig, type RotationStrategy, type ProxyHealth } from './proxy/proxy-rotator'

// Block Detection
export { BlockDetector, type BlockSignal } from './strategy/block-detector'

// Checkpoints
export { CheckpointManager, type CrawlCheckpoint } from './checkpoint/checkpoint'
