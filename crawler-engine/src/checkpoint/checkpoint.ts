/**
 * CheckpointManager — Serializes and restores crawler state for pause/resume.
 * Inspired by Scrapling's checkpoint-based crawl persistence.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { CrawlStatisticsSnapshot, CrawlRequest } from '../types'

export interface CrawlCheckpoint {
  version: 1
  id: string
  timestamp: Date
  startUrl: string
  visited: string[]
  canonicalUrls: [string, string][]
  paginationCount: [string, number][]
  knownAuthCookies: string[]
  stats: CrawlStatisticsSnapshot
  totalErrors: number
  queueState?: {
    pending: CrawlRequest[]
    seen: string[]
  }
}

export class CheckpointManager {
  /**
   * Save a checkpoint to disk
   */
  async save(checkpoint: CrawlCheckpoint, dir: string): Promise<string> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const filename = `checkpoint-${checkpoint.id}.json`
    const filepath = path.join(dir, filename)

    const serialized = JSON.stringify(checkpoint, (_key, value) => {
      if (value instanceof Date) return { __date: value.toISOString() }
      if (value instanceof Buffer) return { __buffer: value.toString('base64') }
      return value
    }, 2)

    fs.writeFileSync(filepath, serialized, 'utf-8')

    // Also write a pointer to the latest checkpoint
    fs.writeFileSync(path.join(dir, 'latest.txt'), checkpoint.id, 'utf-8')

    return checkpoint.id
  }

  /**
   * Load a checkpoint from disk
   */
  async load(dir: string, id?: string): Promise<CrawlCheckpoint | null> {
    try {
      const checkpointId = id || this.getLatestId(dir)
      if (!checkpointId) return null

      const filepath = path.join(dir, `checkpoint-${checkpointId}.json`)
      if (!fs.existsSync(filepath)) return null

      const raw = fs.readFileSync(filepath, 'utf-8')
      const parsed = JSON.parse(raw, (_key, value) => {
        if (value && typeof value === 'object' && '__date' in value) {
          return new Date(value.__date)
        }
        if (value && typeof value === 'object' && '__buffer' in value) {
          return Buffer.from(value.__buffer, 'base64')
        }
        return value
      })

      return parsed as CrawlCheckpoint
    } catch {
      return null
    }
  }

  /**
   * Get the ID of the latest checkpoint
   */
  private getLatestId(dir: string): string | null {
    try {
      const latestFile = path.join(dir, 'latest.txt')
      if (!fs.existsSync(latestFile)) return null
      return fs.readFileSync(latestFile, 'utf-8').trim()
    } catch {
      return null
    }
  }

  /**
   * List all checkpoint IDs in a directory
   */
  async list(dir: string): Promise<string[]> {
    try {
      if (!fs.existsSync(dir)) return []
      const files = fs.readdirSync(dir)
      return files
        .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'))
        .map(f => f.replace('checkpoint-', '').replace('.json', ''))
    } catch {
      return []
    }
  }

  /**
   * Delete a checkpoint
   */
  async delete(dir: string, id: string): Promise<void> {
    const filepath = path.join(dir, `checkpoint-${id}.json`)
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
    }
  }
}
