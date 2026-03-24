# Floww Setup Guide

## Prerequisites

- **Node.js 20+** (`node --version`)
- **Docker** (for PostgreSQL + Redis)
- **Chrome/Chromium** (Playwright will install it)

## 1. Start Infrastructure

```bash
cd floww
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5433`
- **Redis** on port `6381`

## 2. Install Dependencies

```bash
# Install all workspace dependencies from the root
npm install
```

This installs dependencies for all three packages: `crawler-engine`, `backend`, and `frontend`.

## 3. Build Crawler Engine

The backend depends on `@floww/crawler-engine` as a local package. Build it first:

```bash
cd crawler-engine
npm run build
cd ..
```

## 4. Setup Database

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env — at minimum set:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/floww
#   JWT_SECRET=your-secret-key-at-least-32-characters-long
#   DISABLE_AUTH=true  (for development)

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Install Playwright browser
npx playwright install chromium

cd ..
```

## 5. Run Development Servers

```bash
# Terminal 1: Backend API (port 8000)
cd backend && npm run dev

# Terminal 2: Frontend UI (port 4000)
cd frontend && npm run dev
```

Open **http://localhost:4000** to access the Floww UI.

## 6. Verify Setup

```bash
# Health check
curl http://localhost:8100/health

# Readiness check (verifies DB connection)
curl http://localhost:8100/readyz
```

## Using Floww

### Create a Project

**Via UI:** Click "New Project" at http://localhost:4000

**Via API:**
```bash
curl -X POST http://localhost:8100/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "baseUrl": "https://example.com"}'
```

### Start a Crawl

**Via UI:** Open your project → click "Start Crawl"

**Via API:**
```bash
curl -X POST http://localhost:8100/api/v1/projects/{PROJECT_ID}/crawl \
  -H "Content-Type: application/json" \
  -d '{"config": {"maxPages": 50, "maxDepth": 3}}'
```

### What Happens During a Crawl

1. Backend creates a `CrawlSession` in the database
2. `@floww/crawler-engine` launches Playwright with stealth patches
3. The crawler opens a visible browser window (headless: false by default)
4. **First page prompt**: the browser shows a floating panel — complete any login/setup, then click "Continue Crawling"
5. The crawler autonomously navigates, discovering links, SPA routes, and forms
6. Each page is archived (HTML + screenshot saved to disk)
7. The knowledge graph builds incrementally
8. Progress events stream to the frontend via WebSocket

### Monitor Progress

- **Frontend**: real-time progress bar + page list on the project detail page
- **WebSocket**: connect to `ws://localhost:8100/api/v1/ws/crawl/{sessionId}`
- **Metrics**: `GET /metrics` (Prometheus format)

### Generate Documentation

After crawling completes:

**Via UI:** Click "Generate Documentation" on the project page

**Via API:**
```bash
curl -X POST http://localhost:8100/api/v1/projects/{PROJECT_ID}/documents \
  -H "Content-Type: application/json" \
  -d '{"title": "My App Docs", "format": "MARKDOWN"}'
```

Download the generated document:
```bash
curl http://localhost:8100/api/v1/projects/{PROJECT_ID}/documents/{DOC_ID}/content \
  -o documentation.md
```

### AI-Enhanced Documentation

Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `backend/.env` to enable:
- Screenshot analysis (page purpose, target users, UI element descriptions)
- Workflow detection across pages
- Multi-language translation

Run AI analysis:
```bash
curl -X POST http://localhost:8100/api/v1/projects/{PROJECT_ID}/analyze
```

Then regenerate documentation — it will include AI insights.

## Interactive Crawling

When the crawler encounters obstacles:

| Obstacle | Behavior |
|----------|----------|
| **Login form** | Shows floating panel in browser — enter credentials, click Continue |
| **CAPTCHA** | Pauses, notifies frontend via WebSocket |
| **Cookie banner** | Auto-dismissed (17 platform-specific + text-based patterns) |
| **Popups/modals** | Auto-closed (close button, escape, backdrop click) |
| **Cloudflare challenge** | Waits up to 30s for challenge to pass |

## Production Deployment

### Docker (recommended)

```bash
# Build and start all services
docker compose --profile production up -d --build
```

Services:
- **Frontend**: http://localhost:80 (nginx + SPA routing)
- **Backend**: http://localhost:8100 (Node.js + Playwright)
- **PostgreSQL**: internal (port 5432)
- **Redis**: internal (port 6379)

### Environment Variables for Production

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@postgres:5432/floww
JWT_SECRET=<long-random-string>
DISABLE_AUTH=false
CORS_ORIGINS=https://your-domain.com
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://redis:6379
```

## Running Tests

```bash
cd crawler-engine
npm test        # 87 tests, ~2s
```

## Troubleshooting

### Backend won't start: "Cannot find module '@floww/crawler-engine'"
→ Build the crawler engine first: `cd crawler-engine && npm run build`

### Prisma errors
→ Run `cd backend && npx prisma generate && npx prisma db push`

### Browser crashes during crawl
→ Ensure Playwright browsers are installed: `cd backend && npx playwright install chromium`
→ Reduce concurrency: set `maxBrowsers: 1` in crawl config

### No pages discovered
→ Check if the site blocks bots — enable stealth mode (on by default)
→ Check robots.txt: `curl https://target-site.com/robots.txt`
→ Increase delay: `"delayMs": 2000`

### WebSocket not connecting
→ Frontend hardcodes `ws://localhost:8100` — ensure backend is running on port 8000
→ Check browser console for WebSocket errors

## Project File Locations

| What | Where |
|------|-------|
| Database schema | `backend/prisma/schema.prisma` |
| API routes | `backend/src/modules/*/routes.ts` |
| Crawler config | `crawler-engine/src/config.ts` |
| Archived pages | `backend/archive_storage/{projectId}/{urlHash}/{timestamp}/` |
| Generated docs | `backend/storage/output/documents/{projectId}/` |
| Knowledge graphs | `backend/graph_storage/{projectId}/graph.json` |
