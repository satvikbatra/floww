# Floww — AI Agent Memory Bank

## What This Project Is

Floww is an autonomous SaaS documentation generator. It crawls web applications, archives every page (HTML + screenshots), builds a knowledge graph, runs AI analysis, and generates end-user documentation.

## Monorepo Structure

This is an npm workspaces monorepo with 3 packages:

```
floww/
├── crawler-engine/   → @floww/crawler-engine (standalone npm package)
├── backend/          → @floww/backend (Hono API server)
├── frontend/         → floww-frontend (React + Vite)
```

**Build order matters**: `crawler-engine` must be built before `backend` (backend imports from it as `@floww/crawler-engine`).

## Tech Stack

- **Language**: TypeScript throughout (strict mode)
- **Runtime**: Node.js 20+
- **Crawler**: Playwright (Chromium only — CDP features require it)
- **Backend framework**: Hono (not Express, not Fastify)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT (bcrypt for passwords)
- **AI**: OpenAI GPT-4 Vision + Anthropic Claude (both optional)
- **Graph**: Graphology library
- **Queue**: BullMQ + Redis (optional, falls back to in-memory)
- **Frontend**: React 18 + Vite + React Router + D3 + vis-network
- **Validation**: Zod everywhere (config, API schemas, env vars)
- **Testing**: Vitest (87 tests in crawler-engine)
- **CI**: GitHub Actions (.github/workflows/ci.yml)

## Key Architecture Patterns

### Crawler Engine (`crawler-engine/src/`)
- **Event-driven**: `FlowwCrawler extends EventEmitter`, emits `PAGE_CRAWLED`, `CRAWL_PROGRESS`, `CRAWL_COMPLETED`, etc.
- **Hook system**: `onBeforeNavigate`, `onAfterNavigate`, `onObstacleDetected`, etc. — hooks can abort/skip/cancel
- **Pipeline pattern**: `ContentPipeline` runs `IContentProcessor` implementations sequentially. Each processor mutates `ProcessorContext`
- **Strategy pattern**: `URLNavigator` with `DEPTH_ONLY`, `SAME_DOMAIN`, `FULL` strategies
- **Browser modules are stateless functions** that take a Playwright `Page` and return data
- **Config via Zod schema** (`CrawlerConfigSchema`) — all options have defaults

### Backend (`backend/src/`)
- **Modular routes**: each domain in `modules/{name}/routes.ts` (Hono router)
- **Services**: business logic in `services/{name}/` — singletons exported at module level
- **Middleware**: auth (`requireAuth`), rate limiting (in-memory token bucket), CORS, request timing
- **WebSocket**: `noServer` mode WSS attached to HTTP upgrade, managed by `WebSocketEventManager` singleton
- **CrawlerService**: thin wrapper around `@floww/crawler-engine` that hooks into events to persist to DB, archive, graph, and broadcast via WebSocket

### Frontend (`frontend/src/`)
- **5 pages**: ProjectList, ProjectCreate, ProjectDetail, GraphExplorer, ArchiveBrowser
- **API hook**: `hooks/useApi.ts` — centralized API calls
- **WebSocket**: connects per crawl session for real-time progress

## Database Schema (Prisma)

Models: `User`, `ApiKey`, `Project`, `CrawlSession`, `Snapshot`, `Document`, `Webhook`

Key relationships:
- User → Projects (1:N)
- Project → CrawlSessions (1:N)
- CrawlSession → Snapshots (1:N)
- Project → Documents (1:N)

## File Storage Layout

```
backend/archive_storage/{projectId}/{urlHash}/{timestamp}/
  ├── index.html
  ├── screenshot.png
  └── metadata.json

backend/graph_storage/{projectId}/graph.json

backend/storage/output/documents/{projectId}/
  ├── documentation.md (or .html)
  └── screenshots/
```

## Crawler Engine Modules

### Browser layer (17 files in `src/browser/`)
| Module | Purpose |
|--------|---------|
| `browser-pool.ts` | Manages pool of Playwright browser instances with retirement |
| `browser-instance.ts` | Wraps BrowserContext, single-page reuse pattern |
| `stealth.ts` | 11 anti-bot patches (webdriver, chrome runtime, plugins, WebGL, etc.) |
| `page-handler.ts` | `navigateAndWait()`, `extractPageData()`, `detectObstacle()` |
| `spa-navigator.ts` | SPA route discovery: DOM inspection + exploratory clicking |
| `cdp-session.ts` | CDP session lifecycle, WeakMap cache per Page |
| `accessibility-tree.ts` | `Accessibility.getFullAXTree` via CDP, parses AX nodes |
| `dom-indexer.ts` | Indexes interactive elements: `[1]<button>Submit</button>` format |
| `visibility-filter.ts` | CSS visibility check + CDP paint-order occlusion detection |
| `watchdog.ts` | Abstract Watchdog + WatchdogManager + 5 concrete watchdogs |
| `cookie-banner.ts` | Auto-dismiss: OneTrust, CookieBot, text-based buttons |
| `popup-dismisser.ts` | Close buttons, escape, backdrop click, force removal |
| `challenge-handler.ts` | Cloudflare, DDoS-Guard, Sucuri, Akamai + meta refresh |
| `session-guard.ts` | Auth cookie detection, session validity checking |
| `resource-blocker.ts` | Block fonts, media, 22 tracker/ad domains |
| `form-submitter.ts` | Submit GET forms with sample data for discovery |
| `content-extractor.ts` | Shadow DOM, iframes, hash routes, canonical, hreflang, pagination |

### Pipeline processors (6 files in `src/pipeline/processors/`)
`html-cleaner` → `link-extractor` → `metadata` → `markdown` → `screenshot` → `dom-enricher`

### Enriched DOM features (browser-use inspired)
- `enableEnrichedDOM: true` in config activates CDP-based features
- Merges accessibility tree with DOM elements
- Assigns numeric indices to interactive elements for LLM consumption
- Filters occluded elements via paint-order check
- `enableWatchdogs: true` activates event-driven monitoring

## API Routes Summary

All under `/api/v1/`:
- `auth/` — register, login, refresh, me
- `projects/` — CRUD + stats
- `projects/:id/crawl` — start, list sessions, status, cancel
- `projects/:id/archive/` — snapshots, timeline, compare, stats
- `projects/:id/graph/` — nodes, edges, workflows, visualization, search
- `projects/:id/documents` — generate (async), list, download, delete
- `projects/:id/analyze` — start, status, results

WebSocket: `ws://host:8100/api/v1/ws/crawl/{sessionId}?token=JWT`

## Configuration

### Crawler config (Zod schema in `crawler-engine/src/config.ts`)
Key fields: `maxPages`, `maxDepth`, `delayMs`, `strategy`, `headless`, `useStealth`, `processors`, `enableEnrichedDOM`, `enableWatchdogs`, `includePatterns`, `excludePatterns`

### Backend env (Zod schema in `backend/src/config/env.ts`)
Required: `DATABASE_URL`, `JWT_SECRET`
Optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `REDIS_URL`, `DISABLE_AUTH`

## Common Commands

```bash
# Build
cd crawler-engine && npm run build

# Test
cd crawler-engine && npm test

# Typecheck
cd crawler-engine && npx tsc --noEmit
cd backend && npx tsc --noEmit

# Dev servers
cd backend && npm run dev       # :8100
cd frontend && npm run dev      # :4000

# Database
cd backend && npx prisma generate
cd backend && npx prisma db push
cd backend && npx prisma studio  # GUI

# Docker
docker compose up -d                          # infra only
docker compose --profile production up -d     # full stack
```

## Conventions

- Config objects use Zod schemas with `.default()` for all optional fields
- Browser modules export plain async functions (not classes), taking `Page` as first arg
- Pipeline processors implement `IContentProcessor { name: string; process(ctx): Promise<ctx> }`
- Hooks use `HookContext` with `abort()`, `skip()`, `cancelCrawl()` control flow
- Error handling: processors continue on failure (log and move on), hooks stop on abort/skip/cancel
- All new crawler features should be opt-in via config flags (default `false`)
- Singleton pattern for: PrismaClient, WebSocketEventManager, MetricsCollector, LLMClient
- Events follow `CrawlEvent` enum for type safety

## Tests

87 tests in `crawler-engine/src/__tests__/`:
- `navigation.test.ts` (14) — URL strategies, patterns, depth
- `similarity.test.ts` (9) — URL dedup, content fingerprinting
- `queue.test.ts` (20) — MemoryQueue, request creation, URL normalization
- `retry-handler.test.ts` (7) — backoff, non-transient error detection
- `hooks.test.ts` (7) — sequential execution, abort/skip/cancel
- `stats.test.ts` (10) — statistics + error tracking
- `redirect-guard.test.ts` (7) — loop detection
- `pipeline.test.ts` (9) — pipeline + 4 processors
- `config.test.ts` (4) — Zod schema validation
