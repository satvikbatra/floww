# Floww - Autonomous SaaS Documentation Generator

Floww autonomously explores SaaS web applications and generates comprehensive end-user documentation with screenshots, AI analysis, workflow detection, and multi-language support.

## How It Works

```
Your SaaS App → Floww Crawler Engine → AI Analysis → Complete Documentation
```

1. **Crawls** your application like a real user (handles SPAs, auth, popups)
2. **Archives** every page — HTML snapshots + full-page screenshots
3. **Builds** a knowledge graph of pages, forms, buttons, workflows
4. **Analyzes** screenshots with GPT-4 Vision / Claude to understand UI purpose
5. **Generates** documentation in Markdown or HTML with embedded screenshots

## Architecture

```
floww/                          # npm workspaces monorepo
├── crawler-engine/             # @floww/crawler-engine — standalone npm package
│   └── src/
│       ├── browser/            # Playwright automation (17 modules)
│       │   ├── browser-pool.ts         # Multi-browser management
│       │   ├── stealth.ts              # 11 anti-bot detection patches
│       │   ├── page-handler.ts         # Navigation, SPA detection, extraction
│       │   ├── spa-navigator.ts        # Route discovery by DOM + clicking
│       │   ├── cdp-session.ts          # Chrome DevTools Protocol sessions
│       │   ├── accessibility-tree.ts   # AX tree extraction via CDP
│       │   ├── dom-indexer.ts          # Indexed element mapping for LLMs
│       │   ├── visibility-filter.ts    # Paint-order occlusion detection
│       │   ├── watchdog.ts             # Event-driven popup/banner/challenge monitors
│       │   ├── cookie-banner.ts        # Auto-dismiss consent banners
│       │   ├── popup-dismisser.ts      # Auto-close modals/overlays
│       │   ├── challenge-handler.ts    # Cloudflare/DDoS-Guard/Sucuri
│       │   ├── session-guard.ts        # Auth session validation
│       │   ├── resource-blocker.ts     # Block fonts/media/trackers
│       │   ├── form-submitter.ts       # Submit GET forms for discovery
│       │   └── content-extractor.ts    # Shadow DOM, iframes, pagination
│       ├── pipeline/           # Content processing chain
│       │   ├── processors/
│       │   │   ├── html-cleaner.ts     # Strip scripts/styles/ads
│       │   │   ├── markdown-converter.ts
│       │   │   ├── metadata-extractor.ts
│       │   │   ├── screenshot-capture.ts
│       │   │   ├── link-extractor.ts
│       │   │   └── dom-enricher.ts     # CDP accessibility + indexed DOM
│       │   └── content-pipeline.ts
│       ├── strategy/           # Navigation & dedup
│       │   ├── navigation.ts           # DEPTH_ONLY / SAME_DOMAIN / FULL
│       │   ├── similarity.ts           # URL pattern + content fingerprinting
│       │   ├── robots.ts / sitemap.ts
│       │   └── redirect-guard.ts
│       ├── queue/              # Request management
│       ├── hooks/              # Lifecycle hooks (beforeNavigate, afterProcess, etc.)
│       ├── stats/              # Crawl statistics + error tracking
│       ├── scaling/            # CPU/memory autoscaler
│       ├── session/            # Cookie/proxy session pool
│       ├── retry/              # Exponential backoff retry
│       └── crawler.ts          # FlowwCrawler — main orchestrator
│
├── backend/                    # Hono API server
│   └── src/
│       ├── modules/
│       │   ├── auth/           # JWT register/login/refresh
│       │   ├── projects/       # Project CRUD + stats
│       │   ├── crawl/          # Start/stop/status + CrawlerService wrapper
│       │   ├── archive/        # Snapshot listing, timeline, compare
│       │   ├── graph/          # Knowledge graph nodes/edges/workflows
│       │   ├── documents/      # Generate/list/download documentation
│       │   └── analysis/       # AI analysis trigger + results
│       ├── services/
│       │   ├── ai/             # OpenAI + Anthropic LLM clients
│       │   ├── archive/        # HTML + screenshot storage on disk
│       │   ├── graph/          # Graphology knowledge graph
│       │   ├── documents/      # Markdown/HTML doc generator
│       │   ├── events/         # WebSocket event manager
│       │   ├── interactive/    # Browser UI for login/captcha prompts
│       │   ├── monitoring/     # Prometheus metrics
│       │   └── metering/       # Usage tracking
│       ├── middleware/         # Auth, CORS, rate limiting
│       └── prisma/            # PostgreSQL schema
│
├── frontend/                   # React 18 + Vite
│   └── src/
│       ├── pages/              # ProjectList, ProjectCreate, ProjectDetail,
│       │                       # GraphExplorer, ArchiveBrowser
│       ├── components/         # InteractiveCrawlBanner/Dialog, Toast, etc.
│       └── hooks/              # API + WebSocket hooks
│
├── docker-compose.yml          # PostgreSQL + Redis + backend + frontend
├── .github/workflows/ci.yml    # GitHub Actions: typecheck → test → build → docker
└── .dockerignore
```

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d    # PostgreSQL (5433) + Redis (6381)

# 2. Install dependencies (npm workspaces)
npm install

# 3. Setup database
cd backend
cp .env.example .env    # Edit DATABASE_URL, JWT_SECRET
npx prisma generate
npx prisma db push
npx playwright install chromium
cd ..

# 4. Build crawler engine
cd crawler-engine && npm run build && cd ..

# 5. Run
cd backend && npm run dev       # API on :8000
cd frontend && npm run dev      # UI on :4000 (separate terminal)
```

Open http://localhost:4000

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Crawler Engine** | TypeScript, Playwright, Chrome DevTools Protocol, Zod |
| **Backend** | Hono, Prisma (PostgreSQL), JWT, BullMQ, Zod |
| **Frontend** | React 18, Vite, React Router, D3, vis-network |
| **AI** | OpenAI GPT-4 Vision, Anthropic Claude |
| **Graph** | Graphology |
| **Infrastructure** | Docker, GitHub Actions, nginx |

## API Endpoints

All endpoints under `/api/v1/`. Auth required unless noted.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT token |
| POST | `/auth/refresh` | Refresh token |
| GET | `/auth/me` | Current user |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects` | Create project |
| GET | `/projects` | List projects |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/projects/:id/stats` | Crawl/doc/snapshot counts |

### Crawling
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/crawl` | Start crawl |
| GET | `/projects/:id/crawl` | List sessions |
| GET | `/projects/:id/crawl/:sid` | Session status |
| POST | `/projects/:id/crawl/:sid/cancel` | Cancel crawl |

### Archive
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:id/archive/snapshots` | List snapshots |
| GET | `/projects/:id/archive/snapshots/:sid` | Get snapshot |
| GET | `/projects/:id/archive/timeline/:urlHash` | URL version history |
| POST | `/projects/:id/archive/compare` | Compare snapshots |

### Knowledge Graph
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:id/graph/nodes` | Get nodes |
| GET | `/projects/:id/graph/edges` | Get edges |
| GET | `/projects/:id/graph/workflows` | Detected workflows |
| GET | `/projects/:id/graph/visualization` | Full graph export |

### Documents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/documents` | Generate docs (async) |
| GET | `/projects/:id/documents` | List documents |
| GET | `/projects/:id/documents/:did/content` | Download document |

### Analysis
| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/analyze` | Start AI analysis |
| GET | `/projects/:id/analyze/status` | Analysis progress |
| GET | `/projects/:id/analyze/results` | Analysis results |

### WebSocket
```
ws://localhost:8100/api/v1/ws/crawl/{sessionId}?token=JWT
```
Events: `crawl:started`, `crawl:progress`, `crawl:completed`, `page:visited`, `interaction:required`

## Crawler Engine Features

The crawler engine (`@floww/crawler-engine`) is a standalone npm package usable independently:

```typescript
import { FlowwCrawler, CrawlEvent } from '@floww/crawler-engine'

const crawler = new FlowwCrawler({
  maxPages: 100,
  maxDepth: 5,
  strategy: 'same_domain',
  useStealth: true,
  enableEnrichedDOM: true,   // CDP accessibility tree + indexed elements
  enableWatchdogs: true,     // Reactive popup/banner/challenge monitoring
  processors: ['link-extractor', 'metadata', 'screenshot', 'dom-enricher'],
})

crawler.on(CrawlEvent.PAGE_CRAWLED, (result) => {
  console.log(`Crawled: ${result.pageData.title}`)
  console.log(`Enriched DOM: ${result.enrichedDOM}`)  // [1]<button>Sign Up</button> ...
})

crawler.onObstacleDetected(async (ctx) => {
  console.log(`Obstacle: ${ctx.obstacle.type} at ${ctx.obstacle.pageUrl}`)
  ctx.skip()  // or handle login/captcha
})

await crawler.crawl('https://your-app.com')
```

### Key capabilities
- **Stealth mode** — 11 anti-detection patches (WebGL, plugins, navigator, etc.)
- **SPA navigation** — discovers routes via DOM inspection, framework detection (Next.js/Vue/Angular), and exploratory clicking
- **CDP enriched DOM** — accessibility tree merging, indexed element mapping (`[1]<button>Submit</button>`), paint-order visibility filtering
- **Watchdog system** — event-driven background monitors for popups, cookie banners, security challenges, DOM mutations, soft navigations
- **Content similarity** — URL pattern dedup + content fingerprinting saves 80-90% crawl time
- **Hook system** — beforeNavigate, afterNavigate, beforeProcess, afterProcess, obstacleDetected

## Environment Variables

```env
# Required
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/floww"
JWT_SECRET="your-secret-key-at-least-32-characters-long"

# Optional
PORT=8000                          # Default: 8000
DISABLE_AUTH=true                  # Skip JWT auth in development
CORS_ORIGINS="http://localhost:4000"
OPENAI_API_KEY="sk-..."           # For AI analysis + doc generation
ANTHROPIC_API_KEY="sk-ant-..."    # Alternative AI provider
REDIS_URL="redis://localhost:6381" # For persistent queue
```

## Deployment

### Docker (production)

```bash
# Start everything including app containers
docker compose --profile production up -d
```

This starts: PostgreSQL, Redis, backend (`:8000`), frontend (`:80` via nginx).

### Manual

```bash
npm run build                     # Build all packages
cd backend && npm start           # Node.js server on :8000
cd frontend && npx vite preview   # Preview built frontend
```

## Tests

```bash
cd crawler-engine && npm test     # 87 tests across 9 suites
```

Covers: navigation strategies, similarity detection, queue management, retry logic, hook system, pipeline processors, config validation, statistics, redirect guard.

## License

MIT
