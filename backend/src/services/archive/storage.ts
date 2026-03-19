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
  html: string
  screenshotPath?: string
  contentHash: string
  visualHash?: string
  httpStatus: number
  loadTimeMs: number
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
   * Capture and archive a page
   */
  async captureSnapshot(
    page: Page,
    projectId: string,
    crawlSessionId: string | undefined,
    startTime: number
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
    const html = await page.content()
    const title = await page.title()

    // Save HTML
    const htmlPath = path.join(snapshotDir, 'index.html')
    await fs.writeFile(htmlPath, html, 'utf-8')

    // Take screenshot
    const screenshotPath = path.join(snapshotDir, 'screenshot.png')
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    })

    // Compute hashes
    const contentHash = this.computeHash(html)
    const screenshotBuffer = await fs.readFile(screenshotPath)
    const visualHash = this.computeHash(screenshotBuffer.toString('base64'))

    // Save metadata
    const loadTimeMs = Date.now() - startTime
    const metadata: SnapshotData = {
      id: crypto.randomUUID(),
      projectId,
      crawlSessionId,
      url,
      urlHash,
      title,
      html,
      screenshotPath,
      contentHash,
      visualHash,
      httpStatus: 200,
      loadTimeMs,
      capturedAt: new Date(),
    }

    const metadataPath = path.join(snapshotDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

    return metadata
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
          snapshots.push(JSON.parse(data))
        } catch {
          // Skip invalid snapshots
        }
      }

      return snapshots.sort(
        (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()
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
            // Convert date string back to Date object
            snapshot.capturedAt = new Date(snapshot.capturedAt)
            snapshots.push(snapshot)
          } catch (err) {
            console.error(`Failed to read snapshot metadata at ${metadataPath}:`, err)
            // Skip invalid
          }
        }
      }

      return snapshots.sort(
        (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
      )
    } catch (err) {
      console.error(`Failed to read snapshots for project ${projectId}:`, err)
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
    // Simple comparison based on hashes
    const textChanged = snapshot1.contentHash !== snapshot2.contentHash
    const visualChanged = snapshot1.visualHash !== snapshot2.visualHash

    // Calculate similarity (1 = identical, 0 = completely different)
    const textSimilarity = textChanged ? 0.5 : 1.0 // Simplified
    const visualSimilarity = visualChanged ? 0.5 : 1.0 // Simplified

    return {
      textChanged,
      visualChanged,
      textSimilarity,
      visualSimilarity,
    }
  }

  /**
   * Compute normalized URL hash
   */
  private computeUrlHash(url: string): string {
    const normalized = url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/#.*$/, '')
      .replace(/\/$/, '')

    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  }

  /**
   * Compute content hash
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  /**
   * Get storage stats
   */
  async getStats(projectId: string): Promise<{
    totalSnapshots: number
    totalSizeBytes: number
    uniqueUrls: number
  }> {
    const snapshots = await this.getAllSnapshots(projectId)
    const uniqueUrls = new Set(snapshots.map((s) => s.url)).size

    // Calculate total size (simplified - just count files)
    const totalSizeBytes = snapshots.length * 1024 * 100 // Rough estimate

    return {
      totalSnapshots: snapshots.length,
      totalSizeBytes,
      uniqueUrls,
    }
  }
}

// Singleton
export const archiveService = new ArchiveService()
