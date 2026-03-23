import type { Page, Response } from 'playwright'
import type { CrawlRequest, PageData, ObstacleInfo } from '../types'
import type { BrowserInstance } from '../browser/browser-instance'

export type HookName =
  | 'beforeNavigate'
  | 'afterNavigate'
  | 'beforeProcess'
  | 'afterProcess'
  | 'pageCreate'
  | 'browserCreate'
  | 'obstacleDetected'

export interface HookContext {
  request: CrawlRequest
  page: Page
  pageData?: PageData
  response?: Response | null
  obstacle?: ObstacleInfo
  browserInstance?: BrowserInstance
  // Control flow
  abort: () => void       // abort this request
  skip: () => void        // skip but continue crawl
  cancelCrawl: () => void // stop entire crawl
  // State flags (set by control flow calls)
  aborted: boolean
  skipped: boolean
  cancelled: boolean
}

export type HookFn = (ctx: HookContext) => Promise<void>
