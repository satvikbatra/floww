# Floww: Production Crawler Engine — Implementation Plan

## PROGRESS
- [x] Phase 1: Scaffold monorepo (root package.json, tsconfig.base, move backend→floww-app, move frontend)
- [x] Phase 2: Engine foundation (types, config, events, queue interface, memory queue)
- [x] Phase 3: Browser layer (stealth, browser-instance, browser-pool, page-handler)
- [x] Phase 4: Strategy layer (navigation, similarity, robots.txt, sitemap parser)
- [x] Phase 5: Pipeline + hooks + stats + scaling + sessions + retry (all 15 files)
- [x] Phase 6: Main FlowwCrawler class + public API exports (crawler.ts + index.ts)
- [x] Phase 7: Wire floww-app (thin CrawlerService wrapper, captureFromResult in archive)
- [x] Both packages compile: 0 TypeScript errors
- [x] Crawler engine: 32 source files, standalone npm package
- [x] Floww app: 36 source files, imports @floww/crawler-engine
- [ ] Phase 8: Tests + integration verification

## Context
The current crawler is a monolithic 500-line class using an in-memory array as a queue, a single browser, no persistent state, and hardcoded logic. It cannot handle medium-to-large websites reliably. We're restructuring into a monorepo with a standalone crawler engine (`@floww/crawler-engine`) that any product can wrap, and the documentation app (`@floww/floww-app`) that adds DB persistence, knowledge graph, archive, interactive handler, AI analysis, and doc generation on top.

The engine is modeled after Crawlee/Firecrawl's architecture: request queue, browser pool, session management, autoscaling, content pipeline, hook system, and statistics.

---

## Monorepo Structure

```
/package.json                    ← workspace root
/tsconfig.base.json              ← shared TS config
/packages/
  /crawler-engine/               ← @floww/crawler-engine (standalone, npm-publishable)
    package.json
    tsconfig.json
    src/
      index.ts                   ← public API exports
      crawler.ts                 ← FlowwCrawler main class (EventEmitter)
      config.ts                  ← CrawlerConfig Zod schema
      types.ts                   ← CrawlRequest, PageData, CrawlResult, CrawlSummary
      events/
        event-types.ts           ← event name constants + payload types
      queue/
        queue-interface.ts       ← IRequestQueue interface
        memory-queue.ts          ← in-memory fallback (dev)
        redis-queue.ts           ← BullMQ-backed (production)
        request.ts               ← CrawlRequest factory
      browser/
        browser-pool.ts          ← multi-browser management + retirement
        browser-instance.ts      ← single browser wrapper
        stealth.ts               ← 14 stealth patches (from existing undetected-browser.ts)
        page-handler.ts          ← navigateAndWait, SPA detection, extractPageData (from existing playwright.ts)
      session/
        session-pool.ts          ← manages sessions (cookies, proxy, state)
        session.ts               ← single session: good/bad/retired
      scaling/
        autoscaler.ts            ← adjusts concurrency from CPU/memory
        system-monitor.ts        ← os.cpus() + os.freemem() snapshots
      pipeline/
        content-pipeline.ts      ← ordered processor chain
        processor-interface.ts   ← IContentProcessor interface
        processors/
          html-cleaner.ts        ← strip scripts/styles/ads
          markdown-converter.ts  ← HTML → markdown
          metadata-extractor.ts  ← title, OG tags, headings (from existing dom-parser.ts)
          screenshot-capture.ts  ← page screenshot (from existing screenshot.ts)
          link-extractor.ts      ← extract + normalize + deduplicate links
      strategy/
        navigation.ts            ← URLNavigator: DEPTH_ONLY/SAME_DOMAIN/FULL (from existing)
        similarity.ts            ← SimilarityDetector (from existing)
        robots.ts                ← robots.txt parser (NEW)
        sitemap.ts               ← XML sitemap parser (NEW)
      hooks/
        hook-manager.ts          ← register/execute async hooks by name
        types.ts                 ← HookName, HookContext definitions
      stats/
        statistics.ts            ← request counts, timing, error rates
        error-tracker.ts         ← group errors by type
      retry/
        retry-handler.ts         ← configurable retries + escalation

  /floww-app/                    ← @floww/floww-app (documentation product)
    package.json                 ← depends on @floww/crawler-engine
    tsconfig.json
    .env
    prisma/schema.prisma
    src/                         ← current backend/src (moved here)
      modules/crawl/service.ts   ← REWRITTEN: thin wrapper around engine
      (everything else stays)
    frontend/                    ← current frontend/ (moved here)
```

---

## Public API of @floww/crawler-engine

```typescript
import { FlowwCrawler } from '@floww/crawler-engine'

const crawler = new FlowwCrawler({
  maxPages: 50,
  maxDepth: 3,
  strategy: 'same_domain',
  headless: true,
  maxBrowsers: 2,
  maxPagesPerBrowser: 50,
  respectRobotsTxt: true,
  useSitemap: true,
  processors: ['link-extractor', 'metadata', 'screenshot'],
})

// Events (all persistence is the consumer's job)
crawler.on('page:crawled', (result) => { /* save to DB, archive, graph */ })
crawler.on('page:failed', ({ request, error, willRetry }) => { /* log */ })
crawler.on('page:skipped', ({ request, reason }) => { /* log */ })
crawler.on('crawl:progress', ({ visited, total, currentUrl, queueSize }) => { /* WS */ })
crawler.on('crawl:completed', (summary) => { /* finalize */ })
crawler.on('interaction:needed', ({ type, pageUrl, message }) => { /* show UI */ })

// Hooks (inject custom logic)
crawler.onBeforeNavigate(async (ctx) => { /* set cookies */ })
crawler.onAfterNavigate(async (ctx) => { /* check for obstacles */ })
crawler.onObstacleDetected(async (ctx) => { /* interactive handler */ })

await crawler.crawl('https://app.example.com')
```

---

## What Existing Code Goes Where

### Moves to crawler-engine (copy + adapt):
| Current File | Engine Destination | Changes |
|---|---|---|
| `services/browser/undetected-browser.ts` | `browser/stealth.ts` | Remove `appConfig` dep, pass userDataDir as param |
| `services/browser/playwright.ts` → `navigateAndWait`, `waitForSPAContent`, `extractPageData`, `PageData` | `browser/page-handler.ts` | Extract as standalone functions, remove singleton |
| `services/browser/screenshot.ts` → `ScreenshotCapture` | `pipeline/processors/screenshot-capture.ts` | Adapt to IContentProcessor interface |
| `services/extraction/dom-parser.ts` → `DOMParser.extractPageStructure` | `pipeline/processors/metadata-extractor.ts` | Adapt to processor interface |
| `services/crawl/similarity-detector.ts` | `strategy/similarity.ts` | Verbatim (no external deps) |
| `services/navigation/url-strategy.ts` | `strategy/navigation.ts` | Verbatim (no external deps) |
| `modules/crawl/service.ts` → crawl loop logic | `crawler.ts` | Decompose into event-driven FlowwCrawler, remove all DB/WS/graph calls |

### Stays in floww-app:
All Prisma/DB, Hono routes, auth, knowledge graph, archive storage, document generator, AI analysis, interactive handler, WebSocket manager, frontend.

### Deleted from floww-app (replaced by engine imports):
- `services/browser/playwright.ts` (BrowserService singleton)
- `services/navigation/url-strategy.ts`
- `services/crawl/similarity-detector.ts`

---

## Floww-App Wrapper (~120 lines replacing 500)

The current `CrawlerService` becomes `CrawlerServiceWrapper` that:
1. Creates `FlowwCrawler` from project config
2. Registers `onBrowserCreate` hook → initializes `BrowserInteractiveHandler`
3. Registers `onObstacleDetected` hook → delegates to interactive handler
4. Listens to `page:crawled` → saves snapshot to archive + DB, builds knowledge graph, sends WS events
5. Listens to `crawl:completed` → resolves graph edges, marks session completed
6. Listens to `crawl:error` → marks session failed

The engine knows NOTHING about Prisma, WebSocket, KnowledgeGraph, or ArchiveService.

---

## Implementation Phases (Ordered)

### Phase 1: Scaffold Monorepo
- Create root `package.json` with npm workspaces
- Create `tsconfig.base.json`
- Move `backend/` → `packages/floww-app/`
- Move `frontend/` → `packages/floww-app/frontend/`
- Create empty `packages/crawler-engine/` with package.json + tsconfig
- Verify: `npx tsc --noEmit` passes in floww-app (nothing changed, just moved)

### Phase 2: Engine Foundation
- Create `types.ts`, `config.ts`, `events/event-types.ts`
- Create `queue/queue-interface.ts`, `queue/memory-queue.ts`, `queue/redis-queue.ts`, `queue/request.ts`
- Verify: types compile

### Phase 3: Browser Layer
- Copy stealth patches → `browser/stealth.ts` (remove appConfig dep)
- Create `browser/browser-instance.ts` (wraps BrowserContext, tracks page count)
- Create `browser/browser-pool.ts` (multi-browser, retirement after N pages)
- Extract page-handler → `browser/page-handler.ts` (navigateAndWait, SPA detect, extractPageData)
- Verify: browser layer compiles

### Phase 4: Strategy Layer
- Copy navigation.ts, similarity.ts verbatim
- Create `strategy/robots.ts` (new — fetch/parse robots.txt)
- Create `strategy/sitemap.ts` (new — parse XML sitemaps)
- Verify: strategy layer compiles

### Phase 5: Pipeline + Hooks + Stats + Scaling + Sessions + Retry
- Create processor interface + ContentPipeline
- Create 5 processors: html-cleaner, markdown, metadata, screenshot, link-extractor
- Create HookManager with types
- Create CrawlStatistics + ErrorTracker
- Create SystemMonitor + Autoscaler
- Create Session + SessionPool
- Create RetryHandler
- Verify: all modules compile

### Phase 6: Assemble FlowwCrawler
- Create `crawler.ts` — the main class that wires everything together
- Create `index.ts` — public exports
- Verify: full `npx tsc` in crawler-engine passes
- Test: standalone crawl of a test URL

### Phase 7: Wire Up Floww-App
- Add `@floww/crawler-engine` workspace dependency
- Rewrite `modules/crawl/service.ts` as thin wrapper
- Update routes to use new wrapper
- Add `captureSnapshotFromResult()` to ArchiveService (accepts CrawlResult instead of live Page)
- Delete replaced files (old playwright.ts, url-strategy.ts, similarity-detector.ts)
- Verify: `npx tsc --noEmit` in floww-app passes

### Phase 8: Polish
- Add unit tests for queue, strategy, browser pool, pipeline
- Run full integration test: create project → start crawl → verify DB + archive + graph populated
- Update IMPLEMENTATION_PLAN.md with final checkpoint

---

## Engine Dependencies (zero product deps)

```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "cheerio": "^1.2.0"
  },
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "optionalDependencies": {
    "bullmq": "^5.7.0",
    "ioredis": "^5.4.1"
  }
}
```

No: @prisma/client, hono, ws, graphology, openai, @anthropic-ai/sdk

---

## Verification

1. `cd packages/crawler-engine && npx tsc --noEmit` → 0 errors
2. `cd packages/floww-app && npx tsc --noEmit` → 0 errors
3. Standalone test:
   ```typescript
   const crawler = new FlowwCrawler({ maxPages: 5, headless: true })
   crawler.on('page:crawled', r => console.log(r.pageData.title))
   await crawler.crawl('https://example.com')
   ```
4. Integration test: floww-app creates project, starts crawl, checks DB snapshots + graph + archive files
5. `npm pack` in crawler-engine produces clean tarball
