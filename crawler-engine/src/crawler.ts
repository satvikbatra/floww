/**
 * FlowwCrawler — Production-grade web crawler engine
 *
 * Event-driven architecture: emits events, consumer handles persistence.
 * No knowledge of databases, WebSockets, or product-specific logic.
 *
 * Features:
 * - Concurrent page processing (configurable maxConcurrency)
 * - Per-domain throttling
 * - Proxy rotation with health tracking
 * - Blocked request detection with adaptive throttling
 * - Checkpoint-based pause/resume
 * - Hook system for extensibility
 * - Pipeline-based content processing
 */

import { EventEmitter } from 'events'
import crypto from 'crypto'
import fs from 'fs'
import { CrawlerConfigSchema, type CrawlerConfig } from './config'
import type { CrawlRequest, CrawlResult, CrawlSummary } from './types'
import { CrawlEvent } from './events/event-types'
import { MemoryQueue } from './queue/memory-queue'
import { RedisQueue } from './queue/redis-queue'
import type { IRequestQueue } from './queue/queue-interface'
import { createRequest, normalizeUrl } from './queue/request'
import { BrowserPool } from './browser/browser-pool'
import { navigateAndWait, extractPageData, detectObstacle } from './browser/page-handler'
import { discoverRoutesFromDOM, discoverRoutesByClicking, scrollToLoadContent } from './browser/spa-navigator'
import { dismissCookieBanner } from './browser/cookie-banner'
import { dismissPopups } from './browser/popup-dismisser'
import { installResourceBlocker } from './browser/resource-blocker'
import { submitGetForms } from './browser/form-submitter'
import { checkSessionStatus, detectAuthCookies, captureStorageState, applyStorageState } from './browser/session-guard'
import { handleChallenge, handleMetaRefresh } from './browser/challenge-handler'
import { extractIframeLinks, detectHashRoutes, extractCanonicalUrl, detectHreflangUrls, detectPagination } from './browser/content-extractor'
import { RedirectGuard } from './strategy/redirect-guard'
import { isPaginationUrl } from './queue/request'
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
import type { HookFn } from './hooks/types'
import { CrawlStatistics } from './stats/statistics'
import { ErrorTracker } from './stats/error-tracker'
import { Autoscaler } from './scaling/autoscaler'
import { RetryHandler } from './retry/retry-handler'
import { DOMEnricherProcessor } from './pipeline/processors/dom-enricher'
import { WatchdogManager, type WatchdogName } from './browser/watchdog'
import { disposeCDPSession } from './browser/cdp-session'
import { ProxyRotator } from './proxy/proxy-rotator'
import { BlockDetector } from './strategy/block-detector'
import { CheckpointManager, type CrawlCheckpoint } from './checkpoint/checkpoint'

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
  private _similarity!: SimilarityDetector // reserved for future re-enablement
  private robots!: RobotsParser
  private pipeline!: ContentPipeline
  private hookManager: HookManager
  private stats: CrawlStatistics
  private errorTracker: ErrorTracker
  private autoscaler!: Autoscaler
  private retryHandler!: RetryHandler
  private watchdogManager: WatchdogManager | null = null
  private proxyRotator: ProxyRotator | null = null
  private blockDetector: BlockDetector | null = null
  private checkpointManager: CheckpointManager | null = null

  private redirectGuard!: RedirectGuard
  private canonicalUrls = new Map<string, string>()
  private knownAuthCookies: string[] = []
  private paginationCount = new Map<string, number>()
  private maxPaginationPerPattern = 10
  private domainLastRequest = new Map<string, number>()

  private visited = new Set<string>()
  private cancelled = false
  private paused = false
  private totalErrors = 0
  private _consecutiveSimilar = 0 // reserved for future re-enablement
  private startUrl = ''
  private successSinceCheckpoint = 0

  constructor(config: Partial<CrawlerConfig>) {
    super()
    this.config = CrawlerConfigSchema.parse(config)

    // Auto-adjust: maxBrowsers must be >= maxConcurrency
    if (this.config.maxConcurrency > this.config.maxBrowsers) {
      this.config.maxBrowsers = this.config.maxConcurrency
    }

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
    this.startUrl = startUrl
    this.cancelled = false
    this.paused = false
    this.totalErrors = 0
    this._consecutiveSimilar = 0
    this.successSinceCheckpoint = 0
    this.visited.clear()
    this.stats.reset()

    await this.initSubsystems(startUrl)

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

      // === MAIN CRAWL LOOP (concurrent) ===
      await this.runConcurrentLoop()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit(CrawlEvent.CRAWL_ERROR, { error: err, fatal: true })
    } finally {
      await this.browserPool.closeAll()
      await this.queue.close()
    }

    // Build summary
    const completedAt = new Date()
    const snapshot = this.stats.getSnapshot()
    const summary: CrawlSummary = {
      totalRequests: snapshot.totalRequests,
      successCount: snapshot.successCount,
      failedCount: snapshot.failedCount,
      skippedCount: snapshot.skippedCount,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      pagesPerSecond: this.visited.size / Math.max(1, (completedAt.getTime() - startedAt.getTime()) / 1000),
      startedAt,
      completedAt,
      statistics: snapshot,
    }

    this.emit(CrawlEvent.CRAWL_COMPLETED, summary)
    return summary
  }

  /**
   * Resume crawling from a checkpoint
   */
  async resumeFromCheckpoint(checkpointDir: string, checkpointId?: string): Promise<CrawlSummary> {
    if (!this.checkpointManager) {
      this.checkpointManager = new CheckpointManager()
    }

    const checkpoint = await this.checkpointManager.load(checkpointDir, checkpointId)
    if (!checkpoint) {
      throw new Error(`No checkpoint found in ${checkpointDir}${checkpointId ? ` (id: ${checkpointId})` : ''}`)
    }

    // Restore state
    this.visited = new Set(checkpoint.visited)
    this.canonicalUrls = new Map(checkpoint.canonicalUrls)
    this.paginationCount = new Map(checkpoint.paginationCount)
    this.knownAuthCookies = checkpoint.knownAuthCookies
    this.totalErrors = checkpoint.totalErrors

    // Restore queue if available
    if (checkpoint.queueState && this.queue && 'restore' in this.queue) {
      await (this.queue as any).restore(checkpoint.queueState)
    }

    return this.crawl(checkpoint.startUrl)
  }

  /**
   * Pause the crawler — saves checkpoint if enabled, then stops the loop.
   * Returns the checkpoint ID if a checkpoint was saved.
   */
  async pause(): Promise<string | null> {
    this.paused = true

    if (this.config.enableCheckpoints && this.config.checkpointDir) {
      return this.saveCheckpoint()
    }
    return null
  }

  /**
   * Cancel the crawler — stops immediately without saving state.
   */
  async cancel(): Promise<void> {
    this.cancelled = true
  }

  // ─── Private: Initialization ───────────────────────────────────

  private async initSubsystems(startUrl: string): Promise<void> {
    // Queue
    if (this.config.queueBackend === 'redis' && this.config.redisUrl) {
      const redisQueue = new RedisQueue(this.config.redisUrl)
      await redisQueue.init()
      this.queue = redisQueue
    } else {
      this.queue = new MemoryQueue()
    }

    // Proxy rotation
    if (this.config.proxies.length > 0) {
      this.proxyRotator = new ProxyRotator(
        this.config.proxies,
        this.config.proxyRotation,
        this.config.maxProxyFailures
      )
    }

    this.browserPool = new BrowserPool(this.config, this.proxyRotator ?? undefined)
    this.navigator = new URLNavigator({
      strategy: STRATEGY_MAP[this.config.strategy] || NavigationStrategy.SAME_DOMAIN,
      baseUrl: startUrl,
      maxDepth: this.config.maxDepth,
      includePatterns: this.config.includePatterns,
      excludePatterns: this.config.excludePatterns,
    })
    this._similarity = new SimilarityDetector({
      maxSimilarUrlsPerPattern: this.config.maxSimilarUrlsPerPattern,
      contentSimilarityThreshold: this.config.contentSimilarityThreshold,
    })
    this.robots = new RobotsParser()
    this.retryHandler = new RetryHandler(this.config.maxRetries, this.config.retryDelayMs)
    this.redirectGuard = new RedirectGuard()
    this.canonicalUrls.clear()
    this.paginationCount.clear()
    this.domainLastRequest.clear()
    this.knownAuthCookies = []

    this.autoscaler = new Autoscaler({
      maxConcurrency: this.config.maxConcurrency,
      maxCpuPercent: this.config.maxCpuPercent,
      maxMemoryPercent: this.config.maxMemoryPercent,
    })

    // Block detection
    if (this.config.enableBlockDetection) {
      this.blockDetector = new BlockDetector(this.config.blockThreshold)
    }

    // Checkpoints
    if (this.config.enableCheckpoints) {
      this.checkpointManager = new CheckpointManager()
    }

    // Content pipeline
    this.pipeline = new ContentPipeline()
    const processorNames = new Set(this.config.processors)
    if (processorNames.has('html-cleaner')) this.pipeline.addProcessor(new HtmlCleanerProcessor())
    if (processorNames.has('link-extractor')) this.pipeline.addProcessor(new LinkExtractorProcessor())
    if (processorNames.has('metadata')) this.pipeline.addProcessor(new MetadataProcessor())
    if (processorNames.has('markdown')) this.pipeline.addProcessor(new MarkdownProcessor())
    if (processorNames.has('screenshot')) this.pipeline.addProcessor(new ScreenshotProcessor())
    if (processorNames.has('dom-enricher') || this.config.enableEnrichedDOM) {
      this.pipeline.addProcessor(new DOMEnricherProcessor(this.config.enrichedDOMOptions))
    }

    // Watchdogs
    if (this.config.enableWatchdogs) {
      this.watchdogManager = new WatchdogManager(this.config.watchdogs as WatchdogName[])
    } else {
      this.watchdogManager = null
    }

    // Restore saved session (storageState) if available
    const storageState = this.loadStorageState()
    if (storageState) {
      try {
        const instance = await this.browserPool.acquire()
        const page = await instance.getPage()
        await applyStorageState(page, storageState)
        this.browserPool.release(instance)
        this.emit(CrawlEvent.SESSION_RESTORED, { cookieCount: storageState.cookies?.length ?? 0 })
      } catch (error) {
        // Session restore failed — continue without it
        this.emit(CrawlEvent.CRAWL_ERROR, {
          error: new Error(`Failed to restore session: ${(error as Error).message}`),
          fatal: false,
        })
      }
    }
  }

  private loadStorageState(): any | null {
    // Inline storageState object takes precedence
    if (this.config.storageState) {
      return this.config.storageState
    }
    // Load from file
    if (this.config.storageStatePath) {
      try {
        const data = fs.readFileSync(this.config.storageStatePath, 'utf-8')
        return JSON.parse(data)
      } catch {
        return null
      }
    }
    return null
  }

  // ─── Private: Concurrent crawl loop ────────────────────────────

  private async runConcurrentLoop(): Promise<void> {
    const activeWorkers = new Set<Promise<void>>()
    const domainInFlight = new Map<string, number>()

    const shouldContinue = () =>
      !this.cancelled &&
      !this.paused &&
      this.visited.size < this.config.maxPages &&
      this.totalErrors < this.config.maxErrorsBeforeStop

    while (shouldContinue()) {
      // Wait if at max concurrency
      const effectiveConcurrency = this.config.autoscale
        ? this.autoscaler.getDesiredConcurrency()
        : this.config.maxConcurrency

      if (activeWorkers.size >= effectiveConcurrency) {
        await Promise.race(activeWorkers)
        continue
      }

      // Autoscaler system pressure check
      if (this.config.autoscale && !this.autoscaler.canAcceptTask()) {
        await this.delay(1000)
        continue
      }

      const request = await this.queue.fetchNext()
      if (!request) {
        // Queue empty — wait for in-flight workers to potentially enqueue more URLs
        if (activeWorkers.size > 0) {
          await Promise.race(activeWorkers)
          continue
        }
        break // Queue empty and no workers — done
      }

      // Run preflight checks (synchronous, in main loop)
      if (!this.passesPreflightChecks(request)) {
        await this.queue.markHandled(request.id)
        continue
      }

      // Domain throttling
      const domain = this.extractDomain(request.url)
      if (domain) {
        const inFlight = domainInFlight.get(domain) || 0
        if (inFlight >= this.config.maxConcurrentPerDomain) {
          // Put it back and try another
          await this.queue.reclaimRequest(request)
          await this.delay(100)
          continue
        }

        // Per-domain delay strategy
        if (this.config.delayStrategy === 'per-domain') {
          const lastReq = this.domainLastRequest.get(domain)
          if (lastReq) {
            const elapsed = Date.now() - lastReq
            const delayMs = this.getEffectiveDelay(domain)
            if (elapsed < delayMs) {
              await this.queue.reclaimRequest(request)
              await this.delay(50)
              continue
            }
          }
          this.domainLastRequest.set(domain, Date.now())
        }

        domainInFlight.set(domain, inFlight + 1)
      }

      // Eagerly mark visited BEFORE spawning worker to prevent duplicates
      this.visited.add(normalizeUrl(request.url))

      // Spawn worker
      const worker = this.processWorker(request, domain)
        .finally(() => {
          activeWorkers.delete(worker)
          if (domain) {
            const count = domainInFlight.get(domain) || 1
            if (count <= 1) domainInFlight.delete(domain)
            else domainInFlight.set(domain, count - 1)
          }

          // Emit progress after each worker completes
          this.queue.size().then(queueSize => {
            this.emit(CrawlEvent.CRAWL_PROGRESS, {
              visited: this.visited.size,
              total: this.config.maxPages,
              currentUrl: request.url,
              queueSize,
              activeWorkers: activeWorkers.size,
            })
          }).catch(() => {})

          // Auto-checkpoint
          if (
            this.config.enableCheckpoints &&
            this.config.checkpointDir &&
            this.successSinceCheckpoint >= this.config.checkpointIntervalPages
          ) {
            this.saveCheckpoint().catch(() => {})
          }
        })

      activeWorkers.add(worker)

      // Per-request delay (only in per-request mode and sequential crawling)
      if (this.config.delayStrategy === 'per-request' && this.config.maxConcurrency <= 1 && !this.cancelled) {
        await this.delay(this.getEffectiveDelay(domain))
      }
    }

    // Drain remaining workers
    if (activeWorkers.size > 0) {
      await Promise.all(activeWorkers)
    }
  }

  // ─── Private: Preflight checks ────────────────────────────────

  private passesPreflightChecks(request: CrawlRequest): boolean {
    // Already visited
    if (this.visited.has(normalizeUrl(request.url))) {
      return false
    }

    // Navigation strategy
    if (!this.navigator.shouldCrawl(request.url)) {
      this.stats.recordSkip()
      this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'navigation strategy' })
      return false
    }

    // Robots.txt
    if (this.config.respectRobotsTxt && !this.robots.isAllowed(request.url)) {
      this.stats.recordSkip()
      this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'disallowed by robots.txt' })
      return false
    }

    // Redirect loop
    if (this.redirectGuard.isRedirectLoop(request.url)) {
      this.stats.recordSkip()
      this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'redirect loop detected' })
      return false
    }

    // Pagination cap
    if (isPaginationUrl(request.url)) {
      const pattern = request.url.replace(/\d+/g, ':n')
      const count = this.paginationCount.get(pattern) || 0
      if (count >= this.maxPaginationPerPattern) {
        this.stats.recordSkip()
        this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: `pagination cap (${this.maxPaginationPerPattern})` })
        return false
      }
      this.paginationCount.set(pattern, count + 1)
    }

    // Block detection — skip blocked domains
    if (this.blockDetector) {
      const domain = this.extractDomain(request.url)
      if (domain && this.blockDetector.isBlocked(domain)) {
        this.stats.recordSkip()
        this.emit(CrawlEvent.PAGE_SKIPPED, { request, reason: 'domain blocked' })
        return false
      }
    }

    return true
  }

  // ─── Private: Worker wrapper ───────────────────────────────────

  private async processWorker(request: CrawlRequest, domain: string | null): Promise<void> {
    try {
      await this.processRequest(request)
      await this.queue.markHandled(request.id)
      this.successSinceCheckpoint++

      // Block detection: record success
      if (this.blockDetector && domain) {
        this.blockDetector.recordSuccess(domain)
        if (this.config.adaptiveThrottling) {
          this.blockDetector.resetDelay(domain)
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.errorTracker.track(request.url, err, request.retryCount)

      // Block detection: record failure
      if (this.blockDetector && domain) {
        const signal = this.blockDetector.recordFailure(domain, err.message)
        if (signal) {
          this.emit(CrawlEvent.BLOCK_DETECTED, signal)
          if (this.config.adaptiveThrottling) {
            this.blockDetector.increaseDelay(domain)
          }
        }
      }

      if (this.retryHandler.shouldRetry(request, err)) {
        this.stats.recordRetry()
        const retryReq = this.retryHandler.prepareForRetry(request)
        await this.queue.reclaimRequest(retryReq)
        this.emit(CrawlEvent.PAGE_FAILED, { request, error: err, willRetry: true })
      } else {
        this.totalErrors++
        this.stats.recordFailure(request.url, err)
        await this.queue.markFailed(request.id)
        this.emit(CrawlEvent.PAGE_FAILED, { request, error: err, willRetry: false })
      }
    }
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
      await installResourceBlocker(browserInstance.context, {
        blockImages: false,
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
      const domain = this.extractDomain(request.url)

      // Handle 429 (rate limited)
      if (httpStatus === 429) {
        const retryAfter = response?.headers()['retry-after']
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 10000
        await this.delay(Math.min(waitMs, 60000))

        // Record as challenge for block detection
        if (this.blockDetector && domain) {
          this.blockDetector.recordChallenge(domain, 'rate-limited')
          this.stats.recordChallenge(domain)
        }

        throw new Error(`Rate limited (429). Retry after ${waitMs}ms`)
      }

      // Handle Cloudflare/bot challenges
      const challenge = await handleChallenge(page, { maxWaitMs: 15000 })
      if (challenge.detected) {
        if (this.blockDetector && domain) {
          const signal = this.blockDetector.recordChallenge(domain, challenge.type || 'unknown')
          if (signal) this.emit(CrawlEvent.BLOCK_DETECTED, signal)
          this.stats.recordChallenge(domain)
        }
        if (!challenge.passed) {
          throw new Error(`Challenge not passed: ${challenge.type}`)
        }
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

      // ── Early obstacle detection (BEFORE any automated clicks) ──
      // Must run before cookie/popup dismissal, which can accidentally
      // click login buttons or trigger OAuth redirects on auth pages.
      const obstacle = await detectObstacle(page, request.url)
      const isLoginPage = obstacle && (obstacle.type === 'login' || obstacle.type === 'oauth')

      // Start watchdogs (skip on login pages — no need)
      if (this.watchdogManager && !isLoginPage) {
        await this.watchdogManager.startAll(page)
      }

      // Dismiss cookie banners and popups — SKIP on login pages
      // to avoid accidentally clicking auth buttons
      if (!isLoginPage) {
        await dismissCookieBanner(page)
        await dismissPopups(page)
      }

      // Session validity check
      if (this.knownAuthCookies.length > 0) {
        const sessionStatus = await checkSessionStatus(page, response, {
          knownAuthCookies: this.knownAuthCookies,
        })
        if (!sessionStatus.isValid) {
          this.emit(CrawlEvent.INTERACTION_NEEDED, {
            type: 'login' as const,
            pageUrl: page.url(),
            pageTitle: await page.title(),
            message: `Session expired (${sessionStatus.reason}). Re-authentication needed.`,
          })
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

      // Process the obstacle detected earlier
      if (obstacle) {
        const isLoginObstacle = obstacle.type === 'login' || obstacle.type === 'oauth'

        if (isLoginObstacle && this.config.enableInteractiveLogin) {
          // Interactive login flow: emit event, run hook (backend waits for user), capture session
          this.emit(CrawlEvent.INTERACTIVE_LOGIN_STARTED, {
            pageUrl: obstacle.pageUrl,
            pageTitle: obstacle.pageTitle,
            type: obstacle.type,
            oauthProviders: obstacle.oauthProviders,
          })

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

            // User completed login — capture session state for persistence
            try {
              const storageState = await captureStorageState(page)
              this.emit(CrawlEvent.INTERACTIVE_LOGIN_COMPLETED, { storageState })
              this.knownAuthCookies = await detectAuthCookies(page)
            } catch {
              // Storage state capture failed — continue anyway
            }

            // Re-navigate to the original URL (user may have been redirected during login)
            await navigateAndWait(page, request.url, {
              timeout: this.config.navigationTimeout,
              retries: 0,
            })
          } else {
            // No hook registered — just emit and skip
            this.emit(CrawlEvent.INTERACTION_NEEDED, obstacle)
            this.visited.add(normalizeUrl(request.url))
            this.stats.recordSkip()
            return
          }
        } else if (this.hookManager.has('obstacleDetected')) {
          // Non-login obstacles or interactive login disabled — existing flow
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

      // Canonical URL dedup
      const canonical = await extractCanonicalUrl(page)
      if (canonical && normalizeUrl(canonical) !== normalizeUrl(finalUrl)) {
        const normalCanonical = normalizeUrl(canonical)
        if (this.visited.has(normalCanonical)) {
          this.stats.recordSkip()
          return
        }
        this.canonicalUrls.set(normalCanonical, finalUrl)
      }

      // Learn auth cookies on first successful authenticated page
      if (this.knownAuthCookies.length === 0 && this.visited.size <= 2) {
        this.knownAuthCookies = await detectAuthCookies(page)
      }

      // Run content pipeline
      const pipelineResult = await this.pipeline.run(page, pageData)

      // Before process hook
      const preProcessCtx = HookManager.createContext(request, page)
      preProcessCtx.pageData = pageData
      await this.hookManager.execute('beforeProcess', preProcessCtx)

      // Attach watchdog events
      if (this.watchdogManager) {
        pipelineResult.metadata.watchdogEvents = this.watchdogManager.getEvents()
      }

      // Build and emit result
      const result: CrawlResult = {
        request,
        pageData,
        screenshot: pipelineResult.screenshot,
        markdown: pipelineResult.markdown,
        metadata: pipelineResult.metadata,
        enrichedDOM: pipelineResult.enrichedDOM,
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

      // SPA route discovery
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
        } catch {
          // Non-critical
        }

        try {
          const clickRoutes = await discoverRoutesByClicking(page, { maxClicks: 10, timeout: 2000 })
          for (const route of clickRoutes) {
            if (!this.visited.has(normalizeUrl(route.url)) && this.navigator.shouldCrawl(route.url)) {
              await this.queue.add(createRequest(route.url, {
                depth: request.depth + 1,
                parentUrl: request.url,
                maxRetries: this.config.maxRetries,
                priority: 4,
              }))
            }
          }
        } catch {
          // Non-critical
        }
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
      } catch {
        // Non-critical
      }

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
      } catch {
        // Non-critical
      }

      // Form submission discovery
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
      } catch {
        // Non-critical
      }

      // Pagination
      try {
        const pagination = await detectPagination(page)
        if (pagination.nextUrl && !this.visited.has(normalizeUrl(pagination.nextUrl))) {
          await this.queue.add(createRequest(pagination.nextUrl, {
            depth: request.depth,
            parentUrl: request.url,
            priority: 15,
          }))
        }
      } catch {
        // Non-critical
      }

      // hreflang
      try {
        const hreflangUrls = await detectHreflangUrls(page)
        for (const alt of hreflangUrls) {
          this.visited.add(normalizeUrl(alt.url))
        }
      } catch {
        // Non-critical
      }
    } finally {
      if (this.watchdogManager) {
        await this.watchdogManager.stopAll()
        this.watchdogManager.clearEvents()
      }
      await disposeCDPSession(page)
      this.browserPool.release(browserInstance)
    }
  }

  // ─── Private: Checkpoint ───────────────────────────────────────

  private async saveCheckpoint(): Promise<string> {
    if (!this.checkpointManager || !this.config.checkpointDir) {
      throw new Error('Checkpoints not enabled')
    }

    const checkpoint: CrawlCheckpoint = {
      version: 1,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      startUrl: this.startUrl,
      visited: Array.from(this.visited),
      canonicalUrls: Array.from(this.canonicalUrls.entries()),
      paginationCount: Array.from(this.paginationCount.entries()),
      knownAuthCookies: this.knownAuthCookies,
      stats: this.stats.getSnapshot(),
      totalErrors: this.totalErrors,
    }

    // Serialize queue if supported
    if (this.queue && 'serialize' in this.queue) {
      checkpoint.queueState = await (this.queue as any).serialize()
    }

    const id = await this.checkpointManager.save(checkpoint, this.config.checkpointDir)
    this.successSinceCheckpoint = 0
    this.emit(CrawlEvent.CHECKPOINT_SAVED, { id, pagesVisited: this.visited.size })
    return id
  }

  // ─── Private: Utilities ────────────────────────────────────────

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }

  private getEffectiveDelay(domain: string | null): number {
    let delay = this.config.delayMs
    if (this.blockDetector && domain) {
      delay *= this.blockDetector.getDelayMultiplier(domain)
    }
    return delay
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
