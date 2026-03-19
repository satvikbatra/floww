import { db } from '../../db/client'
import { browserService } from '../../services/browser/playwright'
import { archiveService } from '../../services/archive/storage'
import { graphManager } from '../../services/graph/knowledge-graph'
import { BrowserInteractiveHandler, InteractionType, InteractionRequest } from '../../services/interactive/browser-handler'
import { URLNavigator, NavigationStrategy, createDepthOnlyNavigator } from '../../services/navigation/url-strategy'
import { wsEventManager, CrawlEventType } from '../../services/events/websocket-manager'
import { SimilarityDetector } from '../../services/crawl/similarity-detector'
import type { Project } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

export class CrawlerService {
  // Static map to track active crawlers by session ID
  private static activeCrawlers = new Map<string, CrawlerService>()
  
  private visited = new Set<string>()
  private queue: string[] = []
  private sessionId: string = ''
  public interactiveHandler: BrowserInteractiveHandler | null = null
  private urlNavigator: URLNavigator | null = null
  private similarityDetector: SimilarityDetector | null = null
  private useDepthOnlyStrategy = true // New feature: only go deeper
  private pagesWithoutNewContent = 0 // Track consecutive similar pages
  
  /**
   * Get an active crawler by session ID
   */
  static getActiveCrawler(sessionId: string): CrawlerService | undefined {
    return this.activeCrawlers.get(sessionId)
  }

  async startCrawl(sessionId: string, project: Project, config: any) {
    this.sessionId = sessionId
    this.visited.clear()
    this.queue = [project.baseUrl]
    this.pagesWithoutNewContent = 0
    
    // Register this crawler as active
    CrawlerService.activeCrawlers.set(sessionId, this)
    
    // Initialize URL navigation strategy
    this.useDepthOnlyStrategy = config.depthOnlyMode === true // Default false (use SAME_DOMAIN)
    this.urlNavigator = new URLNavigator({
      strategy: this.useDepthOnlyStrategy 
        ? NavigationStrategy.DEPTH_ONLY 
        : NavigationStrategy.SAME_DOMAIN,
      baseUrl: project.baseUrl,
      maxDepth: config.maxDepth,
      includePatterns: config.includePatterns,
      excludePatterns: config.excludePatterns,
    })
    
    // Initialize similarity detector to avoid repetitive crawling
    this.similarityDetector = new SimilarityDetector({
      maxSimilarUrlsPerPattern: config.maxSimilarUrlsPerPattern || 3,
      contentSimilarityThreshold: config.contentSimilarityThreshold || 0.85,
    })

    try {
      // Create browser context for interactive handling
      // Use persistent context to leverage existing browser profile with saved logins
      const usePersistentProfile = config.usePersistentProfile !== false // Default true
      
      let context
      if (usePersistentProfile) {
        // Use your existing Chrome profile with all your logins
        context = await browserService.createPersistentContext({
          headless: false,
        })
      } else {
        // Use a fresh browser session (requires manual login)
        context = await browserService.createContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          headless: false,
        })
      }
      
      // Initialize interactive handler with visible browser
      this.interactiveHandler = new BrowserInteractiveHandler(context)
      
      // Listen for interaction events
      this.interactiveHandler.on('interaction:required', async (request) => {
        console.log(`\n🖥️  Browser window opened for user interaction`)
        console.log(`   Please complete the action in the browser and click a button`)
        await wsEventManager.sendInteractionRequired(sessionId, {
          type: request.type,
          message: request.message,
          pageUrl: request.pageUrl,
        })
      })

      const page = await browserService.newPage()
      const graph = await graphManager.getGraph(project.id)
      
      // Send crawl started event
      await wsEventManager.sendToSession(sessionId, {
        type: CrawlEventType.CRAWL_STARTED,
        sessionId,
        timestamp: new Date(),
        data: {
          baseUrl: project.baseUrl,
          strategy: this.useDepthOnlyStrategy ? 'depth_only' : 'same_domain',
          maxPages: config.maxPages,
        },
      })

      console.log(`\n🎯 Navigation Strategy: ${this.useDepthOnlyStrategy ? 'DEPTH_ONLY' : 'SAME_DOMAIN'}`)
      console.log(`📍 Base URL: ${project.baseUrl}`)
      console.log(`📊 Max Pages: ${config.maxPages}\n`)

      while (this.queue.length > 0 && this.visited.size < config.maxPages) {
        let url = this.queue.shift()!

        if (this.visited.has(url)) continue
        
        // First, check navigation strategy (fast check, filters invalid URLs)
        const navigationCheck = this.urlNavigator!.shouldCrawlWithReason(url)
        if (!navigationCheck.shouldCrawl) {
          console.log(`⏭  Skipping (${navigationCheck.reason}): ${url}`)
          continue
        }
        
        // Then check if URL matches a repetitive pattern
        // (only check patterns for URLs that pass navigation strategy)
        const urlCheck = this.similarityDetector!.shouldSkipUrl(url)
        if (urlCheck.skip) {
          console.log(`⏭  Skipping (repetitive pattern): ${url}`)
          console.log(`   Reason: ${urlCheck.reason}`)
          continue
        }
        
        // Check for diminishing returns
        if (this.pagesWithoutNewContent >= 10) {
          console.log(`⚠️  Diminishing returns detected: crawled ${this.pagesWithoutNewContent} similar pages in a row`)
          
          if (this.similarityDetector!.isDiminishingReturns()) {
            console.log(`🛑 Stopping crawl: not finding new content`)
            break
          }
        }

        try {
          const startTime = Date.now()
          
          // Navigate to page
          await browserService.navigateAndWait(page, url)
          
          // For the first page, always prompt for user interaction
          // This allows users to log in, handle redirects, etc.
          const isFirstPage = this.visited.size === 0
          
          // Check for obstacles that need user interaction
          let obstacle = await this.detectObstacle(page, url)
          
          // If it's the first page and no obstacle detected, still prompt the user
          if (isFirstPage && !obstacle) {
            const pageTitle = await page.title()
            obstacle = {
              type: 'manual_action',
              pageUrl: page.url(), // Use actual current URL (may have redirected)
              pageTitle,
              message: 'First page loaded. Please complete any login or initial setup in the browser, then click "Continue Crawling" to start crawling.',
            }
            console.log(`🖥️  First page - prompting user for any initial setup...`)
          }
          
          if (obstacle) {
            console.log(`⚠️  User interaction needed: ${obstacle.type}`)
            
            // Request user interaction via browser window
            const request: InteractionRequest = {
              id: uuidv4(),
              type: this.mapObstacleToInteractionType(obstacle.type),
              pageUrl: obstacle.pageUrl,
              pageTitle: obstacle.pageTitle,
              message: obstacle.message,
              timeout: 300000, // 5 minutes
            }
            
            const response = await this.interactiveHandler!.requestInteraction(request)
            
            if (response.action === 'cancelled') {
              console.log('❌ User cancelled crawling')
              break
            }
            
            if (response.action === 'skipped') {
              console.log(`⏭  User skipped page: ${url}`)
              continue
            }
            
            // User completed interaction, continue crawling
            console.log(`✓ User completed interaction, continuing...`)
            
            // After user interaction, update the URL to current page (may have changed)
            url = page.url()
          }

          // Mark as visited
          this.visited.add(url)

          // Extract page data
          const pageData = await browserService.extractPageData(page)
          
          // Check for content similarity
          const contentCheck = this.similarityDetector!.isContentSimilar(url, {
            title: pageData.title,
            html: pageData.html,
            links: pageData.links,
            forms: pageData.forms,
          })
          
          if (contentCheck.similar) {
            console.log(`⏭  Skipping (similar content): ${url}`)
            console.log(`   Reason: ${contentCheck.reason}`)
            if (contentCheck.similarTo) {
              console.log(`   Similar to: ${contentCheck.similarTo}`)
            }
            this.pagesWithoutNewContent++
            continue
          }
          
          // Reset counter if we found new content
          this.pagesWithoutNewContent = 0

          // ✅ Save to archive
          const snapshot = await archiveService.captureSnapshot(
            page,
            project.id,
            sessionId,
            startTime
          )

          // ✅ Build knowledge graph
          graph.buildFromPageData(pageData)
          await graph.save()

          // Save snapshot to database
          await db.snapshot.create({
            data: {
              projectId: project.id,
              crawlSessionId: sessionId,
              pageUrl: snapshot.url,
              pageUrlHash: snapshot.urlHash,
              pageTitle: snapshot.title,
              snapshotType: 'FULL',
              contentHash: snapshot.contentHash,
              visualHash: snapshot.visualHash,
              httpStatus: snapshot.httpStatus,
              loadTimeMs: snapshot.loadTimeMs,
            },
          })

          // Send progress update via WebSocket
          await wsEventManager.sendProgress(sessionId, {
            pagesVisited: this.visited.size,
            pagesTotal: config.maxPages,
            currentUrl: url,
            status: 'crawling',
          })
          
          // Send page visited event
          await wsEventManager.sendPageVisited(sessionId, {
            url: snapshot.url,
            title: snapshot.title,
            status: snapshot.httpStatus,
            loadTime: snapshot.loadTimeMs,
          })

          // Update progress in database
          await db.crawlSession.update({
            where: { id: sessionId },
            data: {
              pagesVisited: this.visited.size,
            },
          })

          // Extract new links to crawl (filtered by navigation strategy and similarity)
          const allLinks = pageData.links.map((l) => l.href)
          console.log(`   Found ${allLinks.length} links on page`)
          
          // Filter links
          const links = allLinks
            .filter((href) => !this.visited.has(href))
            .filter((href) => {
              const result = this.urlNavigator!.shouldCrawlWithReason(href)
              if (!result.shouldCrawl && allLinks.length <= 20) {
                console.log(`   ⏭  Filtered (navigation - ${result.reason}): ${href}`)
              }
              return result.shouldCrawl
            })
            .filter((href) => {
              // Check if this URL matches a repetitive pattern
              const urlCheck = this.similarityDetector!.shouldSkipUrl(href)
              if (urlCheck.skip) {
                console.log(`   ⏭  Filtered (similarity): ${href}`)
                return false
              }
              return true
            })

          const filteredCount = allLinks.length - links.length
          if (filteredCount > 0) {
            console.log(`   Filtered ${filteredCount} links (${links.length} added to queue)`)
          }

          this.queue.push(...links)
          
          console.log(`✓ Crawled: ${url} (depth: ${this.urlNavigator!.getRelativeDepth(url)}, queue: ${this.queue.length})`)

          // Delay between requests
          await this.delay(config.delayMs || 1000)
        } catch (error) {
          console.error(`Error crawling ${url}:`, error)

          await db.crawlSession.update({
            where: { id: sessionId },
            data: {
              errorsCount: { increment: 1 },
              lastError: error instanceof Error ? error.message : 'Unknown error',
            },
          })
        }
      }

      // Mark as completed
      await db.crawlSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
      
      // Send completion event
      await wsEventManager.sendToSession(sessionId, {
        type: CrawlEventType.CRAWL_COMPLETED,
        sessionId,
        timestamp: new Date(),
        data: {
          pagesVisited: this.visited.size,
          success: true,
        },
      })
      
      // Get and log similarity detection statistics
      if (this.similarityDetector) {
        const stats = this.similarityDetector.getStatistics()
        console.log(`\n📊 Similarity Detection Statistics:`)
        console.log(`   Total URL patterns detected: ${stats.totalPatterns}`)
        console.log(`   Content fingerprints stored: ${stats.totalContentFingerprints}`)
        console.log(`   Duplicates prevented: ${stats.duplicatesDetected}`)
        
        if (stats.topPatterns.length > 0) {
          console.log(`\n🔁 Top Repetitive Patterns:`)
          stats.topPatterns.slice(0, 5).forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.pattern} (${p.count} occurrences)`)
            console.log(`      Examples: ${p.urls.slice(0, 2).join(', ')}`)
          })
        }
      }
      
      console.log(`\n✅ Crawl completed: ${this.visited.size} pages visited`)
    } catch (error) {
      await db.crawlSession.update({
        where: { id: sessionId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          lastError: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      
      // Send failure event
      await wsEventManager.sendToSession(sessionId, {
        type: CrawlEventType.CRAWL_FAILED,
        sessionId,
        timestamp: new Date(),
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    } finally {
      // Cleanup
      if (this.interactiveHandler) {
        await this.interactiveHandler.close()
      }
      await browserService.close()
      
      // Remove from active crawlers map
      CrawlerService.activeCrawlers.delete(sessionId)
      console.log(`✓ Crawler cleaned up for session: ${sessionId}`)
    }
  }

  /**
   * Detect obstacles that require user interaction
   */
  private async detectObstacle(page: any, url: string): Promise<any | null> {
    try {
      const pageTitle = await page.title()
      
      // Check for login page
      const hasLoginForm = await page.evaluate(() => {
        const passwordInput = document.querySelector('input[type="password"]')
        const emailInput = document.querySelector('input[type="email"]')
        return !!(passwordInput && emailInput)
      })
      
      if (hasLoginForm) {
        return {
          type: 'login_required',
          pageUrl: url,
          pageTitle,
          message: 'This page requires login. Please log in manually in the browser window and click "Continue Crawling" when ready.',
        }
      }
      
      // Check for required forms
      const hasRequiredForm = await page.evaluate(() => {
        const requiredInputs = document.querySelectorAll('input[required], select[required], textarea[required]')
        return requiredInputs.length > 0
      })
      
      if (hasRequiredForm) {
        return {
          type: 'form_data_needed',
          pageUrl: url,
          pageTitle,
          message: 'This page has required form fields. Please fill them in the browser window and click "Continue Crawling" when ready.',
        }
      }
      
      // Check for captcha
      const hasCaptcha = await page.evaluate(() => {
        const captchaPatterns = [
          '.g-recaptcha',
          'iframe[src*="recaptcha"]',
          'iframe[src*="captcha"]',
          '[class*="captcha"]',
        ]
        return captchaPatterns.some(pattern => document.querySelector(pattern))
      })
      
      if (hasCaptcha) {
        return {
          type: 'captcha_detected',
          pageUrl: url,
          pageTitle,
          message: 'A CAPTCHA has been detected. Please solve it in the browser window and click "Continue Crawling" when ready.',
        }
      }
      
      return null
    } catch (error) {
      console.error('Error detecting obstacle:', error)
      return null
    }
  }
  
  /**
   * Map obstacle type to interaction type
   */
  private mapObstacleToInteractionType(obstacleType: string): InteractionType {
    switch (obstacleType) {
      case 'login_required':
        return InteractionType.LOGIN_FORM
      case 'form_data_needed':
        return InteractionType.REQUIRED_FORM
      case 'captcha_detected':
        return InteractionType.CAPTCHA
      case 'two_factor_required':
        return InteractionType.TWO_FACTOR
      default:
        return InteractionType.MANUAL_ACTION
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
