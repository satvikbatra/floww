import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { appConfig } from '../../config/env'
import type { Page } from 'playwright'

export interface SnapshotData {
  id: string
  projectId: string
  crawlSessionId?: string
  url: string
  urlHash: string
  title: string
  htmlPath: string
  screenshotPath: string
  snapshotDir: string
  contentHash: string
  visualHash: string
  httpStatus: number
  loadTimeMs: number
  resourceCount: number
  totalSizeBytes: number
  capturedAt: Date
}

export class ArchiveService {
  private basePath: string

  constructor() {
    this.basePath = appConfig.storage.archivePath
  }

  async init() {
    await fs.mkdir(this.basePath, { recursive: true })
  }

  /**
   * Capture and archive a page — saves HTML, screenshot, metadata
   * Returns all file paths for DB persistence
   */
  async captureSnapshot(
    page: Page,
    projectId: string,
    crawlSessionId: string | undefined,
    options: {
      httpStatus: number
      loadTimeMs: number
    }
  ): Promise<SnapshotData> {
    const url = page.url()
    const urlHash = this.computeUrlHash(url)
    const timestamp = Date.now()

    // Create snapshot directory
    const snapshotDir = path.join(
      this.basePath,
      projectId,
      urlHash,
      timestamp.toString()
    )
    await fs.mkdir(snapshotDir, { recursive: true })

    // Get page content
    const title = await page.title()
    let html = ''
    try {
      html = await page.content()
    } catch (error) {
      console.warn(`Failed to get page content for ${url}:`, error)
      html = '<html><body>Failed to capture page content</body></html>'
    }

    // Save HTML
    const htmlPath = path.join(snapshotDir, 'index.html')
    await fs.writeFile(htmlPath, html, 'utf-8')

    // Take screenshot with fallback
    const screenshotPath = path.join(snapshotDir, 'screenshot.png')
    try {
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        timeout: 15000,
      })
    } catch {
      try {
        // Fallback: viewport-only screenshot
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
          timeout: 10000,
        })
      } catch (err) {
        console.warn(`Screenshot failed for ${url}:`, err)
        // Create a placeholder so path is still valid
        await fs.writeFile(screenshotPath, Buffer.from([]))
      }
    }

    // Compute content hash
    const contentHash = this.computeHash(html)

    // Compute visual hash (from screenshot file)
    let visualHash = ''
    try {
      const screenshotBuffer = await fs.readFile(screenshotPath)
      if (screenshotBuffer.length > 0) {
        visualHash = this.computeHash(screenshotBuffer.toString('base64').substring(0, 10000))
      }
    } catch {
      visualHash = contentHash // fallback
    }

    // Count resources (links, scripts, images)
    let resourceCount = 0
    try {
      resourceCount = await page.evaluate(() => {
        return document.querySelectorAll('script, link[rel="stylesheet"], img, video, audio').length
      })
    } catch {}

    // Calculate total size
    const htmlSize = Buffer.byteLength(html, 'utf-8')
    let ssSize = 0
    try {
      const stat = await fs.stat(screenshotPath)
      ssSize = stat.size
    } catch {}
    const totalSizeBytes = htmlSize + ssSize

    const snapshot: SnapshotData = {
      id: crypto.randomUUID(),
      projectId,
      crawlSessionId,
      url,
      urlHash,
      title,
      htmlPath,
      screenshotPath,
      snapshotDir,
      contentHash,
      visualHash,
      httpStatus: options.httpStatus,
      loadTimeMs: options.loadTimeMs,
      resourceCount,
      totalSizeBytes,
      capturedAt: new Date(),
    }

    // Save metadata JSON alongside files
    const metadataPath = path.join(snapshotDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify({
      ...snapshot,
      // Don't store full paths in metadata JSON, use relative
      htmlPath: 'index.html',
      screenshotPath: 'screenshot.png',
    }, null, 2))

    return snapshot
  }

  /**
   * Capture from a CrawlResult (engine provides pre-extracted data + screenshot buffer)
   * No live Page needed — works with data from @floww/crawler-engine events
   */
  async captureFromResult(
    result: { pageData: { url: string; title: string; html: string; httpStatus: number; loadTimeMs: number }; screenshot?: Buffer },
    projectId: string,
    crawlSessionId?: string
  ): Promise<SnapshotData> {
    const url = result.pageData.url
    const urlHash = this.computeUrlHash(url)
    const timestamp = Date.now()

    const snapshotDir = path.join(this.basePath, projectId, urlHash, timestamp.toString())
    await fs.mkdir(snapshotDir, { recursive: true })

    const html = result.pageData.html
    const htmlPath = path.join(snapshotDir, 'index.html')
    await fs.writeFile(htmlPath, html, 'utf-8')

    const screenshotPath = path.join(snapshotDir, 'screenshot.png')
    if (result.screenshot && result.screenshot.length > 0) {
      await fs.writeFile(screenshotPath, result.screenshot)
    } else {
      await fs.writeFile(screenshotPath, Buffer.from([]))
    }

    const contentHash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16)
    let visualHash = contentHash
    if (result.screenshot && result.screenshot.length > 0) {
      visualHash = crypto.createHash('sha256').update(result.screenshot.toString('base64').substring(0, 10000)).digest('hex').slice(0, 16)
    }

    const htmlSize = Buffer.byteLength(html, 'utf-8')
    const ssSize = result.screenshot?.length ?? 0

    const snapshot: SnapshotData = {
      id: crypto.randomUUID(),
      projectId,
      crawlSessionId,
      url,
      urlHash,
      title: result.pageData.title,
      htmlPath,
      screenshotPath,
      snapshotDir,
      contentHash,
      visualHash,
      httpStatus: result.pageData.httpStatus,
      loadTimeMs: result.pageData.loadTimeMs,
      resourceCount: 0,
      totalSizeBytes: htmlSize + ssSize,
      capturedAt: new Date(),
    }

    const metadataPath = path.join(snapshotDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify({
      ...snapshot,
      htmlPath: 'index.html',
      screenshotPath: 'screenshot.png',
    }, null, 2))

    return snapshot
  }

  /**
   * Get timeline of snapshots for a URL
   */
  async getTimeline(projectId: string, url: string): Promise<SnapshotData[]> {
    const urlHash = this.computeUrlHash(url)
    const urlDir = path.join(this.basePath, projectId, urlHash)

    try {
      const timestamps = await fs.readdir(urlDir)
      const snapshots: SnapshotData[] = []

      for (const timestamp of timestamps) {
        const metadataPath = path.join(urlDir, timestamp, 'metadata.json')
        try {
          const data = await fs.readFile(metadataPath, 'utf-8')
          const parsed = JSON.parse(data)
          // Resolve relative paths
          const dir = path.join(urlDir, timestamp)
          parsed.htmlPath = path.join(dir, 'index.html')
          parsed.screenshotPath = path.join(dir, 'screenshot.png')
          parsed.snapshotDir = dir
          parsed.capturedAt = new Date(parsed.capturedAt)
          snapshots.push(parsed)
        } catch {
          // Skip invalid snapshots
        }
      }

      return snapshots.sort(
        (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
      )
    } catch {
      return []
    }
  }

  /**
   * Get all snapshots for a project
   */
  async getAllSnapshots(projectId: string): Promise<SnapshotData[]> {
    const projectDir = path.join(this.basePath, projectId)
    const snapshots: SnapshotData[] = []

    try {
      const urlHashes = await fs.readdir(projectDir)

      for (const urlHash of urlHashes) {
        const urlDir = path.join(projectDir, urlHash)
        const stat = await fs.stat(urlDir)
        if (!stat.isDirectory()) continue

        const timestamps = await fs.readdir(urlDir)

        for (const timestamp of timestamps) {
          const timestampDir = path.join(urlDir, timestamp)
          const timestampStat = await fs.stat(timestampDir)
          if (!timestampStat.isDirectory()) continue

          const metadataPath = path.join(timestampDir, 'metadata.json')
          try {
            const data = await fs.readFile(metadataPath, 'utf-8')
            const snapshot = JSON.parse(data)
            snapshot.htmlPath = path.join(timestampDir, 'index.html')
            snapshot.screenshotPath = path.join(timestampDir, 'screenshot.png')
            snapshot.snapshotDir = timestampDir
            snapshot.capturedAt = new Date(snapshot.capturedAt)
            snapshots.push(snapshot)
          } catch {
            // Skip invalid
          }
        }
      }

      return snapshots.sort(
        (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
      )
    } catch {
      return []
    }
  }

  /**
   * Compare two snapshots
   */
  async compareSnapshots(
    snapshot1: SnapshotData,
    snapshot2: SnapshotData
  ): Promise<{
    textChanged: boolean
    visualChanged: boolean
    textSimilarity: number
    visualSimilarity: number
  }> {
    const textChanged = snapshot1.contentHash !== snapshot2.contentHash
    const visualChanged = snapshot1.visualHash !== snapshot2.visualHash
    const textSimilarity = textChanged ? 0.5 : 1.0
    const visualSimilarity = visualChanged ? 0.5 : 1.0

    return { textChanged, visualChanged, textSimilarity, visualSimilarity }
  }

  /**
   * Compute normalized URL hash
   */
  computeUrlHash(url: string): string {
    const normalized = url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/#.*$/, '')
      .replace(/\/$/, '')

    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  async getStats(projectId: string): Promise<{
    totalSnapshots: number
    totalSizeBytes: number
    uniqueUrls: number
  }> {
    const snapshots = await this.getAllSnapshots(projectId)
    const uniqueUrls = new Set(snapshots.map((s) => s.url)).size
    const totalSizeBytes = snapshots.reduce((sum, s) => sum + (s.totalSizeBytes || 0), 0)

    return { totalSnapshots: snapshots.length, totalSizeBytes, uniqueUrls }
  }
}

export const archiveService = new ArchiveService()
