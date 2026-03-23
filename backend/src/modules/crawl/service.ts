/**
 * CrawlerServiceWrapper — Thin wrapper around @floww/crawler-engine
 *
 * The engine handles crawling. This wrapper handles:
 * - DB persistence (snapshots, sessions)
 * - Knowledge graph building
 * - Archive storage (HTML + screenshots to disk)
 * - WebSocket event broadcasting
 * - Interactive handler (login/captcha via browser UI)
 */

import {
  FlowwCrawler,
  CrawlEvent,
  type CrawlResult,
  type CrawlSummary,
  type HookContext,
  type ObstacleInfo,
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

  async startCrawl(sessionId: string, project: Project, rawConfig: any) {
    const crawler = new FlowwCrawler({
      maxPages: rawConfig.maxPages ?? 100,
      maxDepth: rawConfig.maxDepth ?? 5,
      delayMs: rawConfig.delayMs ?? 1000,
      strategy: rawConfig.depthOnlyMode ? 'depth_only' : 'same_domain',
      headless: false,
      useStealth: rawConfig.stealthMode !== false,
      usePersistentProfile: rawConfig.usePersistentProfile !== false,
      includePatterns: rawConfig.includePatterns || [],
      excludePatterns: rawConfig.excludePatterns || [],
      maxSimilarUrlsPerPattern: rawConfig.maxSimilarUrlsPerPattern ?? 5,
      contentSimilarityThreshold: rawConfig.contentSimilarityThreshold ?? 0.85,
      maxRetries: 2,
      maxErrorsBeforeStop: 20,
      respectRobotsTxt: true,
      useSitemap: true,
      processors: ['link-extractor', 'metadata', 'screenshot'],
    })

    let interactiveHandler: BrowserInteractiveHandler | null = null
    const graph = await graphManager.getGraph(project.id)
    await archiveService.init()

    // Hook: set up interactive handler when browser launches
    crawler.onBrowserCreate(async (ctx: HookContext) => {
      if (ctx.browserInstance) {
        interactiveHandler = new BrowserInteractiveHandler(ctx.browserInstance.context)
        interactiveHandler.on('interaction:required', async (request: any) => {
          await wsEventManager.sendInteractionRequired(sessionId, {
            type: request.type,
            message: request.message,
            pageUrl: request.pageUrl,
          })
        })
      }
    })

    // Hook: handle obstacles via interactive UI
    crawler.onObstacleDetected(async (ctx: HookContext) => {
      if (!interactiveHandler || !ctx.obstacle) { ctx.skip(); return }

      const request: InteractionRequest = {
        id: crypto.randomUUID(),
        type: mapObstacleType(ctx.obstacle.type),
        pageUrl: ctx.obstacle.pageUrl,
        pageTitle: ctx.obstacle.pageTitle,
        message: ctx.obstacle.message,
        timeout: rawConfig.interactionTimeout ?? 300000,
      }

      const response = await interactiveHandler.requestInteraction(request)
      if (response.action === 'cancelled') ctx.cancelCrawl()
      else if (response.action === 'skipped') ctx.skip()
    })

    // Hook: first page prompt for login/setup
    let isFirstPage = true
    crawler.onAfterNavigate(async (ctx: HookContext) => {
      if (!isFirstPage || !interactiveHandler) return
      isFirstPage = false

      const title = await ctx.page.title()
      const request: InteractionRequest = {
        id: crypto.randomUUID(),
        type: InteractionType.MANUAL_ACTION,
        pageUrl: ctx.page.url(),
        pageTitle: title,
        message: 'First page loaded. Complete any login or setup, then click "Continue Crawling".',
        timeout: rawConfig.interactionTimeout ?? 300000,
      }

      const response = await interactiveHandler.requestInteraction(request)
      if (response.action === 'cancelled') ctx.cancelCrawl()
      if (response.action === 'skipped') ctx.skip()
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
          forms: result.pageData.forms.map(f => ({ action: f.action, method: f.method })),
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
      if (interactiveHandler) {
        await (interactiveHandler as BrowserInteractiveHandler).close().catch(() => {})
      }
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
