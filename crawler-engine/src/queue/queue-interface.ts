import type { CrawlRequest } from '../types'

export interface IRequestQueue {
  add(request: CrawlRequest): Promise<boolean> // false if already exists (dedup)
  addMany(requests: CrawlRequest[]): Promise<number> // returns count added
  fetchNext(): Promise<CrawlRequest | null>
  markHandled(id: string): Promise<void>
  markFailed(id: string): Promise<void>
  reclaimRequest(request: CrawlRequest): Promise<void> // re-queue for retry
  isEmpty(): Promise<boolean>
  size(): Promise<number>
  handledCount(): Promise<number>
  has(url: string): Promise<boolean>
  clear(): Promise<void>
  close(): Promise<void>
}
