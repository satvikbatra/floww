# Floww — Quick Start Guide

## Project Structure

```
floww/
  crawler-engine/    ← standalone crawler library (42 files)
  backend/           ← Hono API server + Prisma (36 files)
  frontend/          ← React + Vite UI (13 files)
  docker-compose.yml ← PostgreSQL + Redis
```

## Prerequisites
- Node.js >= 20
- Docker (for PostgreSQL + Redis) OR local PostgreSQL
- Chrome/Chromium installed

## 1. Start Infrastructure

```bash
docker compose up -d
```

## 2. Install Dependencies

```bash
cd crawler-engine && npm install && cd ..
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

## 3. Setup Database

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL if needed

npx prisma generate
npx prisma db push
```

## 4. Install Playwright Browsers

```bash
cd backend
npx playwright install chromium
```

## 5. Build Crawler Engine

```bash
cd crawler-engine
npm run build
```

## 6. Run

```bash
# Terminal 1: Backend (port 8000)
cd backend && npm run dev

# Terminal 2: Frontend (port 4000)
cd frontend && npm run dev
```

Open http://localhost:4000

## How It Works

```
Frontend (:4000)  ←→  Backend API (:8000)  ←→  Crawler Engine (library)
                           ↓                          ↓
                      PostgreSQL              Playwright Browser
                      (sessions,              (crawl, screenshot,
                       snapshots)              extract data)
                           ↓
                    Archive Storage
                    (HTML + screenshots
                     per URL on disk)
```

## Environment Variables (backend/.env)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/floww"
JWT_SECRET="your-secret-key-at-least-32-characters-long"
PORT=8000
DISABLE_AUTH=true
OPENAI_API_KEY=""           # Optional: AI documentation
ANTHROPIC_API_KEY=""        # Optional: AI documentation
REDIS_URL="redis://localhost:6381"  # Optional: persistent queue
```
