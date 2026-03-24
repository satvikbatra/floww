/**
 * CrawlerServiceWrapper — Thin wrapper around @floww/crawler-engine
 *
 * The engine handles crawling. This wrapper handles:
 * - DB persistence (snapshots, sessions)
 * - Knowledge graph building
 * - Archive storage (HTML + screenshots to disk)
 * - WebSocket event broadcasting
 * - Interactive handler (login/captcha via in-page UI — no extra tabs)
 */

import {
  FlowwCrawler,
  CrawlEvent,
  type CrawlResult,
  type CrawlSummary,
  type HookContext,
} from '@floww/crawler-engine'
import { db } from '../../db/client'
import { archiveService } from '../../services/archive/storage'
import { graphManager } from '../../services/graph/knowledge-graph'
import {
  BrowserInteractiveHandler,
  InteractionType,
  type InteractionRequest,
} from '../../services/interactive/browser-handler'
import { wsEventManager, CrawlEventType } from '../../services/events/websocket-manager'
import type { Project } from '@prisma/client'
import crypto from 'crypto'

export class CrawlerService {
  private static activeCrawlers = new Map<
    string,
    { crawler: FlowwCrawler; interactiveHandler: BrowserInteractiveHandler | null }
  >()

  static getActiveCrawler(sessionId: string) {
    return this.activeCrawlers.get(sessionId)
  }

  static getActiveSessionIds(): string[] {
    return Array.from(this.activeCrawlers.keys())
  }

  async startCrawl(sessionId: string, project: Project, rawConfig: any) {
    const crawler = new FlowwCrawler({
      maxPages: rawConfig.maxPages ?? 500,
      maxDepth: rawConfig.maxDepth ?? 10,
      delayMs: rawConfig.delayMs ?? 800,
      strategy: rawConfig.depthOnlyMode ? 'depth_only' : 'same_domain',
      headless: rawConfig.headless ?? false,
      useStealth: rawConfig.stealthMode !== false,
      usePersistentProfile: rawConfig.usePersistentProfile !== false,
      includePatterns: rawConfig.includePatterns || [],
      excludePatterns: rawConfig.excludePatterns || [],
      maxRetries: 2,
      maxErrorsBeforeStop: 20,
      respectRobotsTxt: true,
      useSitemap: true,
      processors: ['link-extractor', 'metadata', 'screenshot'],
      // Concurrency
      maxConcurrency: rawConfig.maxConcurrency ?? 1,
      maxConcurrentPerDomain: rawConfig.maxConcurrentPerDomain ?? 2,
      delayStrategy: rawConfig.delayStrategy ?? 'per-request',
      // Proxy
      proxies: rawConfig.proxies ?? [],
      proxyUrl: rawConfig.proxyUrl,
      proxyRotation: rawConfig.proxyRotation ?? 'round-robin',
      // Block detection
      enableBlockDetection: rawConfig.enableBlockDetection ?? false,
      blockThreshold: rawConfig.blockThreshold ?? 5,
      adaptiveThrottling: rawConfig.adaptiveThrottling ?? false,
      // Checkpoints
      enableCheckpoints: rawConfig.enableCheckpoints ?? false,
      checkpointDir: rawConfig.checkpointDir,
    })

    const interactiveHandler = new BrowserInteractiveHandler()
    const graph = await graphManager.getGraph(project.id)
    await archiveService.init()

    // Notify frontend when interaction is needed
    interactiveHandler.on('interaction:required', async (request: any) => {
      await wsEventManager.sendInteractionRequired(sessionId, {
        type: request.type,
        message: request.message,
        pageUrl: request.pageUrl,
      })
    })

    // Hook: handle obstacles (login, captcha, etc.) — inject UI into the crawler's own page
    crawler.onObstacleDetected(async (ctx: HookContext) => {
      if (!ctx.obstacle) { ctx.skip(); return }

      const request: InteractionRequest = {
        id: crypto.randomUUID(),
        type: mapObstacleType(ctx.obstacle.type),
        pageUrl: ctx.obstacle.pageUrl,
        pageTitle: ctx.obstacle.pageTitle,
        message: ctx.obstacle.message,
        timeout: rawConfig.interactionTimeout ?? 300000,
      }

      // Inject UI into the SAME page the crawler is on — no second tab
      const response = await interactiveHandler.requestInteraction(ctx.page, request)

      if (response.action === 'cancelled') ctx.cancelCrawl()
      else if (response.action === 'skipped') ctx.skip()
      // 'completed' → crawler continues with the page as-is (user may have logged in)
    })

    // Event: page crawled → archive + DB + graph
    crawler.on(CrawlEvent.PAGE_CRAWLED, async (result: CrawlResult) => {
      try {
        const snapshot = await archiveService.captureFromResult(result, project.id, sessionId)

        await db.snapshot.create({
          data: {
            projectId: project.id,
            crawlSessionId: sessionId,
            pageUrl: snapshot.url,
            pageUrlHash: snapshot.urlHash,
            pageTitle: result.pageData.title,
            snapshotType: 'FULL',
            htmlPath: snapshot.htmlPath,
            screenshotPath: snapshot.screenshotPath,
            resourcesDir: snapshot.snapshotDir,
            contentHash: snapshot.contentHash,
            visualHash: snapshot.visualHash,
            httpStatus: result.pageData.httpStatus,
            loadTimeMs: result.pageData.loadTimeMs,
          },
        })

        graph.buildFromPageData({
          url: result.pageData.url,
          title: result.pageData.title,
          links: result.pageData.links,
          forms: result.pageData.forms.map((f: any) => ({ action: f.action, method: f.method })),
          buttons: result.pageData.buttons,
        })

        await wsEventManager.sendPageVisited(sessionId, {
          url: result.pageData.url,
          title: result.pageData.title,
          status: result.pageData.httpStatus,
          loadTime: result.pageData.loadTimeMs,
        })
      } catch (error) {
        console.error('Failed to persist crawl result:', error)
      }
    })

    // Event: progress → DB + WS
    crawler.on(CrawlEvent.CRAWL_PROGRESS, async (progress: any) => {
      await wsEventManager.sendProgress(sessionId, {
        pagesVisited: progress.visited,
        pagesTotal: progress.total,
        currentUrl: progress.currentUrl,
        status: 'crawling',
      })
      await db.crawlSession.update({
        where: { id: sessionId },
        data: { pagesVisited: progress.visited },
      }).catch(() => {})
    })

    // Event: completed → resolve graph + DB
    crawler.on(CrawlEvent.CRAWL_COMPLETED, async (summary: CrawlSummary) => {
      graph.resolveEdges()
      await graph.save()

      await db.crawlSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          pagesVisited: summary.successCount,
        },
      })

      await wsEventManager.sendToSession(sessionId, {
        type: CrawlEventType.CRAWL_COMPLETED,
        sessionId,
        timestamp: new Date(),
        data: { pagesVisited: summary.successCount, durationMs: summary.durationMs },
      })
    })

    // Event: page failed → DB
    crawler.on(CrawlEvent.PAGE_FAILED, async ({ error }: any) => {
      await db.crawlSession.update({
        where: { id: sessionId },
        data: { errorsCount: { increment: 1 }, lastError: error?.message || 'Unknown' },
      }).catch(() => {})
    })

    // Event: block detected → log
    crawler.on(CrawlEvent.BLOCK_DETECTED, async (signal: any) => {
      console.warn(`Block detected on ${signal.domain}: ${signal.reason} (action: ${signal.recommendedAction})`)
    })

    // Event: fatal error → DB + WS
    crawler.on(CrawlEvent.CRAWL_ERROR, async ({ error }: any) => {
      await db.crawlSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED', completedAt: new Date(), lastError: error?.message || 'Fatal' },
      }).catch(() => {})

      await wsEventManager.sendToSession(sessionId, {
        type: CrawlEventType.CRAWL_FAILED, sessionId, timestamp: new Date(),
        data: { error: error?.message },
      })
    })

    // Register + run
    CrawlerService.activeCrawlers.set(sessionId, { crawler, interactiveHandler })

    try {
      await crawler.crawl(project.baseUrl)
    } catch (error) {
      await db.crawlSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED', completedAt: new Date(), lastError: (error as Error).message },
      }).catch(() => {})
    } finally {
      await interactiveHandler.close().catch(() => {})
      CrawlerService.activeCrawlers.delete(sessionId)
    }
  }
}

function mapObstacleType(type: string): InteractionType {
  switch (type) {
    case 'login': return InteractionType.LOGIN_FORM
    case 'captcha': return InteractionType.CAPTCHA
    case '2fa': return InteractionType.TWO_FACTOR
    case 'form': return InteractionType.REQUIRED_FORM
    default: return InteractionType.MANUAL_ACTION
  }
}
