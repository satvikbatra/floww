/**
 * Archive Cleanup — TTL-based cleanup and size management for archive storage
 */

import { promises as fs } from 'fs'
import path from 'path'
import { appConfig } from '../../config/env'
import { archiveLogger } from '../../utils/logger'

interface CleanupResult {
  deletedSnapshots: number
  freedBytes: number
  errors: number
}

/**
 * Delete snapshots older than maxAgeDays
 */
export async function cleanupOldSnapshots(maxAgeDays: number = 30): Promise<CleanupResult> {
  const basePath = appConfig.storage.archivePath
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - maxAgeMs
  const result: CleanupResult = { deletedSnapshots: 0, freedBytes: 0, errors: 0 }

  try {
    const projects = await fs.readdir(basePath)

    for (const projectId of projects) {
      const projectDir = path.join(basePath, projectId)
      const stat = await fs.stat(projectDir).catch(() => null)
      if (!stat?.isDirectory()) continue

      const urlHashes = await fs.readdir(projectDir)
      for (const urlHash of urlHashes) {
        const urlDir = path.join(projectDir, urlHash)
        const urlStat = await fs.stat(urlDir).catch(() => null)
        if (!urlStat?.isDirectory()) continue

        const timestamps = await fs.readdir(urlDir)
        for (const timestamp of timestamps) {
          const ts = parseInt(timestamp)
          if (isNaN(ts) || ts >= cutoff) continue

          const snapshotDir = path.join(urlDir, timestamp)
          try {
            const size = await getDirectorySize(snapshotDir)
            await fs.rm(snapshotDir, { recursive: true, force: true })
            result.deletedSnapshots++
            result.freedBytes += size
          } catch (err) {
            result.errors++
          }
        }

        // Remove empty urlHash directory
        const remaining = await fs.readdir(urlDir)
        if (remaining.length === 0) {
          await fs.rmdir(urlDir).catch(() => {})
        }
      }
    }

    archiveLogger.info('Archive cleanup completed', {
      deleted: result.deletedSnapshots,
      freedMB: Math.round(result.freedBytes / 1024 / 1024),
      errors: result.errors,
    })
  } catch (err) {
    archiveLogger.error('Archive cleanup failed', err)
  }

  return result
}

/**
 * Get total archive storage size
 */
export async function getArchiveSize(): Promise<{ totalBytes: number; snapshotCount: number }> {
  const basePath = appConfig.storage.archivePath
  let totalBytes = 0
  let snapshotCount = 0

  try {
    const projects = await fs.readdir(basePath)
    for (const projectId of projects) {
      const projectDir = path.join(basePath, projectId)
      const stat = await fs.stat(projectDir).catch(() => null)
      if (!stat?.isDirectory()) continue

      const urlHashes = await fs.readdir(projectDir)
      for (const urlHash of urlHashes) {
        const urlDir = path.join(projectDir, urlHash)
        const urlStat = await fs.stat(urlDir).catch(() => null)
        if (!urlStat?.isDirectory()) continue

        const timestamps = await fs.readdir(urlDir)
        snapshotCount += timestamps.length
        for (const timestamp of timestamps) {
          const snapshotDir = path.join(urlDir, timestamp)
          totalBytes += await getDirectorySize(snapshotDir)
        }
      }
    }
  } catch {}

  return { totalBytes, snapshotCount }
}

/**
 * Enforce max storage size — delete oldest snapshots until under limit
 */
export async function enforceStorageLimit(maxSizeBytes: number): Promise<CleanupResult> {
  const result: CleanupResult = { deletedSnapshots: 0, freedBytes: 0, errors: 0 }
  const { totalBytes } = await getArchiveSize()

  if (totalBytes <= maxSizeBytes) return result

  archiveLogger.info('Storage limit exceeded, cleaning up', {
    currentMB: Math.round(totalBytes / 1024 / 1024),
    limitMB: Math.round(maxSizeBytes / 1024 / 1024),
  })

  // Collect all snapshots with timestamps, sort oldest first
  const snapshots: Array<{ path: string; timestamp: number; size: number }> = []
  const basePath = appConfig.storage.archivePath

  try {
    const projects = await fs.readdir(basePath)
    for (const projectId of projects) {
      const projectDir = path.join(basePath, projectId)
      const stat = await fs.stat(projectDir).catch(() => null)
      if (!stat?.isDirectory()) continue

      const urlHashes = await fs.readdir(projectDir)
      for (const urlHash of urlHashes) {
        const urlDir = path.join(projectDir, urlHash)
        const urlStat = await fs.stat(urlDir).catch(() => null)
        if (!urlStat?.isDirectory()) continue

        const timestamps = await fs.readdir(urlDir)
        for (const timestamp of timestamps) {
          const ts = parseInt(timestamp)
          if (isNaN(ts)) continue
          const snapshotDir = path.join(urlDir, timestamp)
          const size = await getDirectorySize(snapshotDir)
          snapshots.push({ path: snapshotDir, timestamp: ts, size })
        }
      }
    }
  } catch {}

  // Sort oldest first
  snapshots.sort((a, b) => a.timestamp - b.timestamp)

  let currentSize = totalBytes
  for (const snapshot of snapshots) {
    if (currentSize <= maxSizeBytes) break

    try {
      await fs.rm(snapshot.path, { recursive: true, force: true })
      currentSize -= snapshot.size
      result.deletedSnapshots++
      result.freedBytes += snapshot.size
    } catch {
      result.errors++
    }
  }

  return result
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name)
      if (entry.isFile()) {
        const stat = await fs.stat(entryPath)
        size += stat.size
      } else if (entry.isDirectory()) {
        size += await getDirectorySize(entryPath)
      }
    }
  } catch {}
  return size
}
