# Floww — Quick Start

## Prerequisites
- Node.js >= 20
- Docker (for PostgreSQL + Redis)

## Setup

```bash
# 1. Start databases
docker compose up -d

# 2. Install dependencies
npm install

# 3. Build crawler engine
cd crawler-engine && npm run build && cd ..

# 4. Setup backend
cd backend
cp .env.example .env
npx prisma generate
npx prisma db push
npx playwright install chromium
cd ..

# 5. Run (two terminals)
cd backend && npm run dev       # API on :8000
cd frontend && npm run dev      # UI on :4000
```

Open http://localhost:4000

## Data Flow

```
Frontend (:4000)  ←WebSocket→  Backend API (:8000)  ←→  Crawler Engine (library)
                                     ↓                         ↓
                                PostgreSQL              Playwright Browser
                                (sessions,              (crawl, screenshot,
                                 snapshots,              extract, analyze)
                                 documents)
                                     ↓
                              Archive Storage
                              (HTML + screenshots
                               per URL on disk)
```

## Environment Variables (backend/.env)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/floww"
JWT_SECRET="your-secret-key-at-least-32-characters-long"
DISABLE_AUTH=true
OPENAI_API_KEY=""           # Optional: AI documentation
ANTHROPIC_API_KEY=""        # Optional: AI documentation
REDIS_URL="redis://localhost:6381"
```

## Tests

```bash
cd crawler-engine && npm test   # 87 tests
```
