/**
 * FlowwCrawler — Production-grade web crawler engine
 *
 * Event-driven architecture: emits events, consumer handles persistence.
 * No knowledge of databases, WebSockets, or product-specific logic.
 */

import { EventEmitter } from 'events'
import { CrawlerConfigSchema, type CrawlerConfig } from './config'
import type { CrawlRequest, CrawlResult, CrawlSummary, PageData, ObstacleInfo } from './types'
import { CrawlEvent } from './events/event-types'
import { MemoryQueue } from './queue/memory-queue'
import { RedisQueue } from './queue/redis-queue'
import type { IRequestQueue } from './queue/queue-interface'
import { createRequest, normalizeUrl } from './queue/request'
import { BrowserPool } from './browser/browser-pool'
import { navigateAndWait, extractPageData, detectObstacle, takeScreenshot } from './browser/page-handler'
import { discoverRoutesFromDOM, discoverRoutesByClicking, scrollToLoadContent } from './browser/spa-navigator'
import { dismissCookieBanner } from './browser/cookie-banner'
import { dismissPopups } from './browser/popup-dismisser'
import { installResourceBlocker } from './browser/resource-blocker'
import { submitGetForms } from './browser/form-submitter'
import { checkSessionStatus, detectAuthCookies } from './browser/session-guard'
import { handleChallenge, handleMetaRefresh } from './browser/challenge-handler'
import { extractIframeLinks, detectHashRoutes, extractCanonicalUrl, detectHreflangUrls, detectPagination } from './browser/content-extractor'
import { RedirectGuard } from './strategy/redirect-guard'
import { isPaginationUrl, extractCanonicalUrl as extractCanonicalFromHtml } from './queue/request'
import { URLNavigator, NavigationStrategy } from './strategy/navigation'
import { SimilarityDetector } from './strategy/similarity'
import { RobotsParser } from './strategy/robots'
import { SitemapParser } from './strategy/sitemap'
import { ContentPipeline } from './pipeline/content-pipeline'
import { ScreenshotProcessor } from './pipeline/processors/screenshot-capture'
import { MetadataProcessor } from './pipeline/processors/metadata-extractor'
import { LinkExtractorProcessor } from './pipeline/processors/link-extractor'
import { HtmlCleanerProcessor } from './pipeline/processors/html-cleaner'
import { MarkdownProcessor } from './pipeline/processors/markdown-converter'
import { HookManager } from './hooks/hook-manager'
import type { HookContext, HookFn } from './hooks/types'
import { CrawlStatistics } from './stats/statistics'
import { ErrorTracker } from './stats/error-tracker'
import { Autoscaler } from './scaling/autoscaler'
import { RetryHandler } from './retry/retry-handler'
import type { Page, Response } from 'playwright'

const STRATEGY_MAP: Record<string, NavigationStrategy> = {
  depth_only: NavigationStrategy.DEPTH_ONLY,
  same_domain: NavigationStrategy.SAME_DOMAIN,
  full: NavigationStrategy.FULL,
}

export class FlowwCrawler extends EventEmitter {
  private config: CrawlerConfig
  private queue!: IRequestQueue
  private browserPool!: BrowserPool
  private navigator!: URLNavigator
  private similarity!: SimilarityDetector
  private robots!: RobotsParser
  private pipeline!: ContentPipeline
  private hookManager: HookManager
  private stats: CrawlStatistics
  private errorTracker: ErrorTracker
  private autoscaler!: Autoscaler
  private retryHandler!: RetryHandler

  private redirectGuard!: RedirectGuard
  private canonicalUrls = new Map<string, string>() // canonical -> actual
  private knownAuthCookies: string[] = []
  private paginationCount = new Map<string, number>() // pattern -> count
  private maxPaginationPerPattern = 10

  private visited = new Set<string>()
  private cancelled = false
  private totalErrors = 0
  private consecutiveSimilar = 0

  constructor(config: Partial<CrawlerConfig>) {
    super()
    this.config = CrawlerConfigSchema.parse(config)
    this.hookManager = new HookManager()
    this.stats = new CrawlStatistics()
    this.errorTracker = new ErrorTracker()
  }

  // --- Hook registration API ---
  onBeforeNavigate(fn: HookFn): void { this.hookManager.register('beforeNavigate', fn) }
  onAfterNavigate(fn: HookFn): void { this.hookManager.register('afterNavigate', fn) }
  onBeforeProcess(fn: HookFn): void { this.hookManager.register('beforeProcess', fn) }
  onAfterProcess(fn: HookFn): void { this.hookManager.register('afterProcess', fn) }
  onPageCreate(fn: HookFn): void { this.hookManager.register('pageCreate', fn) }
  onBrowserCreate(fn: HookFn): void { this.hookManager.register('browserCreate', fn) }
  onObstacleDetected(fn: HookFn): void { this.hookManager.register('obstacleDetected', fn) }

  /**
   * Start crawling from a URL. Returns summary when complete.
   */
  async crawl(startUrl: string): Promise<CrawlSummary> {
    const startedAt = new Date()
    this.cancelled = false
    this.totalErrors = 0
    this.consecutiveSimilar = 0
    this.visited.clear()
    this.stats.reset()

    // Initialize subsystems
    // Initialize queue — Redis for production, memory for dev
    if (this.config.queueBackend === 'redis' && this.config.redisUrl) {
      const redisQueue = new RedisQueue(this.config.redisUrl)
      await redisQueue.init()
      this.queue = redisQueue
    } else {
      this.queue = new MemoryQueue()
    }
    this.browserPool = new BrowserPool(this.config)
    this.navigator = new URLNavigator({
      strategy: STRATEGY_MAP[this.config.strategy] || NavigationStrategy.SAME_DOMAIN,
      baseUrl: startUrl,
      maxDepth: this.config.maxDepth,
      includePatterns: this.config.includePatterns,
      excludePatterns: this.config.excludePatterns,
    })
    this.similarity = new SimilarityDetector({
      maxSimilarUrlsPerPattern: this.config.maxSimilarUrlsPerPattern,
      contentSimilarityThreshold: this.config.contentSimilarityThreshold,
    })
    this.robots = new RobotsParser()
    this.retryHandler = new RetryHandler(this.config.maxRetries, this.config.retryDelayMs)
    this.redirectGuard = new RedirectGuard()
    this.canonicalUrls.clear()
    this.paginationCount.clear()
    this.knownAuthCookies = []
    this.autoscaler = new Autoscaler({
      maxConcurrency: this.config.maxConcurrency,
      maxCpuPercent: this.config.maxCpuPercent,
      maxMemoryPercent: this.config.maxMemoryPercent,
    })

    // Build content pipeline
    this.pipeline = new ContentPipeline()
    const processorNames = new Set(this.config.processors)
    if (processorNames.has('html-cleaner')) this.pipeline.addProcessor(new HtmlCleanerProcessor())
    if (processorNames.has('link-extractor')) this.pipeline.addProcessor(new LinkExtractorProcessor())
    if (processorNames.has('metadata')) this.pipeline.addProcessor(new MetadataProcessor())
    if (processorNames.has('markdown')) this.pipeline.addProcessor(new MarkdownProcessor())
    if (processorNames.has('screenshot')) this.pipeline.addProcessor(new ScreenshotProcessor())

    this.emit(CrawlEvent.CRAWL_STARTED, { startUrl, config: this.config })

    try {
      // Robots.txt
      if (this.config.respectRobotsTxt) {
        await this.robots.fetch(startUrl)
        const crawlDelay = this.robots.getCrawlDelay()
        if (crawlDelay && crawlDelay > this.config.delayMs) {
          this.config.delayMs = crawlDelay
        }
      }

      // Sitemap discovery
      if (this.config.useSitemap) {
        const sitemapParser = new SitemapParser()
        const sitemapUrls = this.robots.getSitemapUrls()
        const entries = await sitemapParser.discover(startUrl, sitemapUrls.length > 0 ? sitemapUrls : undefined)

        for (const entry of entries.slice(0, this.config.maxPages)) {
          if (this.navigator.shouldCrawl(entry.url)) {
            await this.queue.add(createRequest(entry.url, {
              priority: entry.priority ? Math.round((1 - entry.priority) * 20) : 10,
            }))
          }
        }
      }

      // Seed URL (highest priority)
      await this.queue.add(createRequest(startUrl, { priority: 0 }))

      // === MAIN CRAWL LOOP ===
      while (
        !(await this.queue.isEmpty()) &&
        this.visited.size < this.config.maxPages &&
        !this.cancelled &&
        this.totalErrors < this.config.maxErrorsBeforeStop
      ) {
        // Autoscaler check
        if (this.config.autoscale && !this.autoscaler.canAcceptTask()) {
          await this.delay(1000)
          continue
        }

        const request = await this.queue.fetchNext()
        if (!request) break

        // Skip if already visited
        if (this.visited.has(normalizeUrl(request.url))) {
          await this.queue.markHandled(request.id)
          continue
        }

        // Navigation strategy check
        if (!this.navigator.shouldCrawl(request.url)) {
          this.stats.recordSkip()
          this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'navigation strategy' })
          await this.queue.markHandled(request.id)
          continue
        }

        // URL pattern similarity check
        const urlCheck = this.similarity.shouldSkipUrl(request.url)
        if (urlCheck.skip) {
          this.stats.recordSkip()
          this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: urlCheck.reason })
          await this.queue.markHandled(request.id)
          continue
        }

        // Robots.txt check
        if (this.config.respectRobotsTxt && !this.robots.isAllowed(request.url)) {
          this.stats.recordSkip()
          this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'disallowed by robots.txt' })
          await this.queue.markHandled(request.id)
          continue
        }

        // Redirect loop check
        if (this.redirectGuard.isRedirectLoop(request.url)) {
          this.stats.recordSkip()
          this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'redirect loop detected' })
          await this.queue.markHandled(request.id)
          continue
        }

        // Pagination cap — don't crawl more than N pages per pagination pattern
        if (isPaginationUrl(request.url)) {
          const pattern = request.url.replace(/\d+/g, ':n')
          const count = this.paginationCount.get(pattern) || 0
          if (count >= this.maxPaginationPerPattern) {
            this.stats.recordSkip()
            this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: `pagination cap (${this.maxPaginationPerPattern})` })
            await this.queue.markHandled(request.id)
            continue
          }
          this.paginationCount.set(pattern, count + 1)
        }

        // Diminishing returns check
        if (this.consecutiveSimilar >= 15 && this.similarity.isDiminishingReturns()) {
          this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'diminishing returns' })
          break
        }

        // Crawl the page
        try {
          await this.processRequest(request)
          await this.queue.markHandled(request.id)
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          this.errorTracker.track(request.url, err, request.retryCount)

          if (this.retryHandler.shouldRetry(request, err)) {
            this.stats.recordRetry()
            const retryReq = this.retryHandler.prepareForRetry(request)
            await this.queue.reclaimRequest(retryReq)
            this.emit(CrawlEvent.PAGE_FAILED, { request, error: err, willRetry: true })
            await this.delay(this.retryHandler.getDelay(request.retryCount))
          } else {
            this.totalErrors++
            this.stats.recordFailure(request.url, err)
            await this.queue.markFailed(request.id)
            this.emit(CrawlEvent.PAGE_FAILED, { request, error: err, willRetry: false })
          }
        }

        // Emit progress
        this.emit(CrawlEvent.CRAWL_PROGRESS, {
          visited: this.visited.size,
          total: this.config.maxPages,
          currentUrl: request.url,
          queueSize: await this.queue.size(),
        })

        // Delay between requests
        if (!this.cancelled) {
          await this.delay(this.config.delayMs)
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit(CrawlEvent.CRAWL_ERROR, { error: err, fatal: true })
    } finally {
      await this.browserPool.closeAll()
      await this.queue.close()
    }

    // Build summary
    const completedAt = new Date()
    const summary: CrawlSummary = {
      totalRequests: this.stats.getSnapshot().totalRequests,
      successCount: this.stats.getSnapshot().successCount,
      failedCount: this.stats.getSnapshot().failedCount,
      skippedCount: this.stats.getSnapshot().skippedCount,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      pagesPerSecond: this.visited.size / Math.max(1, (completedAt.getTime() - startedAt.getTime()) / 1000),
      startedAt,
      completedAt,
      statistics: this.stats.getSnapshot(),
    }

    this.emit(CrawlEvent.CRAWL_COMPLETED, summary)
    return summary
  }

  /**
   * Process a single request: navigate, extract, run pipeline, emit result
   */
  private async processRequest(request: CrawlRequest): Promise<void> {
    const pageStartTime = Date.now()

    // Acquire browser from pool
    const browserInstance = await this.browserPool.acquire()

    // First-time browser setup: resource blocking + hooks
    if (browserInstance.pageCount === 0) {
      // Install resource blocker to speed up crawling
      await installResourceBlocker(browserInstance.context, {
        blockImages: false, // keep for screenshots
        blockFonts: true,
        blockMedia: true,
        blockTrackers: true,
        blockAds: true,
      })

      if (this.hookManager.has('browserCreate')) {
        const ctx = HookManager.createContext(request, await browserInstance.getPage())
        ctx.browserInstance = browserInstance
        await this.hookManager.execute('browserCreate', ctx)
      }
    }

    const page = await browserInstance.getPage()

    try {
      // Before navigate hook
      const preNavCtx = HookManager.createContext(request, page)
      await this.hookManager.execute('beforeNavigate', preNavCtx)
      if (preNavCtx.aborted || preNavCtx.skipped) {
        this.stats.recordSkip()
        return
      }
      if (preNavCtx.cancelled) { this.cancelled = true; return }

      // Navigate
      const response = await navigateAndWait(page, request.url, {
        timeout: this.config.navigationTimeout,
        retries: 0,
      })

      const httpStatus = response?.status() ?? 200

      // Handle 429 (rate limited) — back off and retry
      if (httpStatus === 429) {
        const retryAfter = response?.headers()['retry-after']
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 10000
        await this.delay(Math.min(waitMs, 60000))
        throw new Error(`Rate limited (429). Retry after ${waitMs}ms`)
      }

      // Handle Cloudflare/bot challenges (wait for them to pass)
      const challenge = await handleChallenge(page, { maxWaitMs: 15000 })
      if (challenge.detected && !challenge.passed) {
        throw new Error(`Challenge not passed: ${challenge.type}`)
      }

      // Handle meta refresh redirects
      const metaRedirect = await handleMetaRefresh(page)
      if (metaRedirect) {
        this.redirectGuard.recordRedirect(request.url, metaRedirect)
        await this.queue.add(createRequest(metaRedirect, { depth: request.depth, parentUrl: request.url }))
        return
      }

      // Track redirects
      const finalUrlAfterNav = page.url()
      if (finalUrlAfterNav !== request.url) {
        this.redirectGuard.recordRedirect(request.url, finalUrlAfterNav)
      }

      // Dismiss cookie banners
      await dismissCookieBanner(page)

      // Dismiss popups/modals that block content
      await dismissPopups(page)

      // Session validity check (detect if we got logged out)
      if (this.knownAuthCookies.length > 0) {
        const sessionStatus = await checkSessionStatus(page, response, {
          knownAuthCookies: this.knownAuthCookies,
        })
        if (!sessionStatus.isValid) {
          // Emit interaction needed for re-auth
          this.emit(CrawlEvent.INTERACTION_NEEDED, {
            type: 'login' as const,
            pageUrl: page.url(),
            pageTitle: await page.title(),
            message: `Session expired (${sessionStatus.reason}). Re-authentication needed.`,
          })
          // Let obstacle hook handle it if registered
          if (this.hookManager.has('obstacleDetected')) {
            const ctx = HookManager.createContext(request, page)
            ctx.obstacle = {
              type: 'login',
              pageUrl: page.url(),
              pageTitle: await page.title(),
              message: `Session expired: ${sessionStatus.reason}`,
            }
            await this.hookManager.execute('obstacleDetected', ctx)
            if (ctx.aborted || ctx.skipped) { this.stats.recordSkip(); return }
            if (ctx.cancelled) { this.cancelled = true; return }
            // After re-auth, learn new cookies
            this.knownAuthCookies = await detectAuthCookies(page)
          }
        }
      }

      // After navigate hook
      const postNavCtx = HookManager.createContext(request, page)
      postNavCtx.response = response
      await this.hookManager.execute('afterNavigate', postNavCtx)
      if (postNavCtx.aborted || postNavCtx.skipped) {
        this.stats.recordSkip()
        return
      }
      if (postNavCtx.cancelled) { this.cancelled = true; return }

      // Skip error pages
      if (httpStatus >= 400) {
        this.visited.add(normalizeUrl(request.url))
        this.stats.recordSkip()
        return
      }

      // Obstacle detection
      const obstacle = await detectObstacle(page, request.url)
      if (obstacle) {
        if (this.hookManager.has('obstacleDetected')) {
          const obsCtx = HookManager.createContext(request, page)
          obsCtx.obstacle = obstacle
          await this.hookManager.execute('obstacleDetected', obsCtx)
          if (obsCtx.aborted || obsCtx.skipped) {
            this.visited.add(normalizeUrl(request.url))
            this.stats.recordSkip()
            return
          }
          if (obsCtx.cancelled) { this.cancelled = true; return }
        } else {
          // No obstacle handler registered — emit event and skip
          this.emit(CrawlEvent.INTERACTION_NEEDED, obstacle)
          this.visited.add(normalizeUrl(request.url))
          this.stats.recordSkip()
          return
        }
      }

      // Mark visited (use final URL after redirects)
      const finalUrl = page.url()
      this.visited.add(normalizeUrl(request.url))
      if (finalUrl !== request.url) this.visited.add(normalizeUrl(finalUrl))

      // Scroll to trigger lazy loading
      await scrollToLoadContent(page, { maxScrolls: 3, scrollDelay: 600 })

      // Extract page data
      const pageData = await extractPageData(page, response)

      // Canonical URL dedup — if page has a canonical that differs from current URL, skip
      const canonical = await extractCanonicalUrl(page)
      if (canonical && normalizeUrl(canonical) !== normalizeUrl(finalUrl)) {
        const normalCanonical = normalizeUrl(canonical)
        if (this.visited.has(normalCanonical)) {
          // Already crawled the canonical version — skip this duplicate
          this.stats.recordSkip()
          return
        }
        // Mark canonical as the "real" URL, add it to visited
        this.canonicalUrls.set(normalCanonical, finalUrl)
      }

      // Learn auth cookies on first successful authenticated page
      if (this.knownAuthCookies.length === 0 && this.visited.size <= 2) {
        this.knownAuthCookies = await detectAuthCookies(page)
      }

      // Content similarity check
      const contentCheck = this.similarity.isContentSimilar(finalUrl, {
        title: pageData.title,
        html: pageData.html,
        links: pageData.links,
        forms: pageData.forms,
      })
      if (contentCheck.similar) {
        this.consecutiveSimilar++
        this.stats.recordSkip()
        return
      }
      this.consecutiveSimilar = 0

      // Run content pipeline
      const pipelineResult = await this.pipeline.run(page, pageData)

      // Before process hook
      const preProcessCtx = HookManager.createContext(request, page)
      preProcessCtx.pageData = pageData
      await this.hookManager.execute('beforeProcess', preProcessCtx)

      // Build and emit result
      const result: CrawlResult = {
        request,
        pageData,
        screenshot: pipelineResult.screenshot,
        markdown: pipelineResult.markdown,
        metadata: pipelineResult.metadata,
        processedAt: new Date(),
      }

      const loadTimeMs = Date.now() - pageStartTime
      this.stats.recordSuccess(request.url, loadTimeMs)
      this.emit(CrawlEvent.PAGE_CRAWLED, result)

      // After process hook
      const postProcessCtx = HookManager.createContext(request, page)
      postProcessCtx.pageData = pageData
      await this.hookManager.execute('afterProcess', postProcessCtx)

      // Enqueue discovered links
      const newLinks = pipelineResult.links
        .filter(l => !this.visited.has(normalizeUrl(l.href)))
        .filter(l => this.navigator.shouldCrawl(l.href))

      for (const link of newLinks) {
        await this.queue.add(createRequest(link.href, {
          depth: request.depth + 1,
          parentUrl: request.url,
          maxRetries: this.config.maxRetries,
        }))
      }

      // SPA route discovery — DOM inspection (non-destructive)
      if (pageData.isSPA || newLinks.length < 3) {
        try {
          const spaRoutes = await discoverRoutesFromDOM(page)
          for (const route of spaRoutes) {
            if (!this.visited.has(normalizeUrl(route.url)) && this.navigator.shouldCrawl(route.url)) {
              await this.queue.add(createRequest(route.url, {
                depth: request.depth + 1,
                parentUrl: request.url,
                maxRetries: this.config.maxRetries,
                priority: 5,
              }))
            }
          }
        } catch {}

        // SPA route discovery — button clicking (destructive, runs after everything else)
        try {
          const clickRoutes = await discoverRoutesByClicking(page, { maxClicks: 10, timeout: 2000 })
          for (const route of clickRoutes) {
            if (!this.visited.has(normalizeUrl(route.url)) && this.navigator.shouldCrawl(route.url)) {
              await this.queue.add(createRequest(route.url, {
                depth: request.depth + 1,
                parentUrl: request.url,
                maxRetries: this.config.maxRetries,
                priority: 4, // high priority — these are real SPA pages
              }))
            }
          }
        } catch {}
      }

      // Hash route discovery
      try {
        const hashRoutes = await detectHashRoutes(page)
        for (const hashUrl of hashRoutes) {
          if (!this.visited.has(normalizeUrl(hashUrl)) && this.navigator.shouldCrawl(hashUrl)) {
            await this.queue.add(createRequest(hashUrl, {
              depth: request.depth + 1,
              parentUrl: request.url,
              priority: 8,
            }))
          }
        }
      } catch {}

      // iframe link discovery
      try {
        const iframeLinks = await extractIframeLinks(page)
        for (const link of iframeLinks) {
          if (!this.visited.has(normalizeUrl(link.href)) && this.navigator.shouldCrawl(link.href)) {
            await this.queue.add(createRequest(link.href, {
              depth: request.depth + 1,
              parentUrl: request.url,
              priority: 12,
            }))
          }
        }
      } catch {}

      // Form submission discovery (GET forms only)
      try {
        const formDiscoveries = await submitGetForms(page, { maxForms: 2 })
        for (const discovery of formDiscoveries) {
          if (!this.visited.has(normalizeUrl(discovery.url)) && this.navigator.shouldCrawl(discovery.url)) {
            await this.queue.add(createRequest(discovery.url, {
              depth: request.depth + 1,
              parentUrl: request.url,
              priority: 7,
            }))
          }
        }
      } catch {}

      // Pagination — detect next page and add to queue
      try {
        const pagination = await detectPagination(page)
        if (pagination.nextUrl && !this.visited.has(normalizeUrl(pagination.nextUrl))) {
          await this.queue.add(createRequest(pagination.nextUrl, {
            depth: request.depth,
            parentUrl: request.url,
            priority: 15, // low priority — content pages first
          }))
        }
      } catch {}

      // hreflang — skip alternate language versions (only crawl primary language)
      try {
        const hreflangUrls = await detectHreflangUrls(page)
        for (const alt of hreflangUrls) {
          // Mark alternate language URLs as visited to prevent crawling duplicates
          this.visited.add(normalizeUrl(alt.url))
        }
      } catch {}
    } finally {
      this.browserPool.release(browserInstance)
    }
  }

  async pause(): Promise<void> {
    this.cancelled = true // simplified — pause = stop for now
  }

  async resume(): Promise<void> {
    // Would need to re-enter crawl loop — complex, omit for MVP
  }

  async cancel(): Promise<void> {
    this.cancelled = true
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
