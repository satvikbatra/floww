# Floww Setup & Testing Guide

## What Floww Does

Floww is an **AI-powered documentation generator** that:

1. **Crawls** your web application like a user would
2. **Archives** snapshots of every page (Wayback Machine style)
3. **Builds** a knowledge graph of UI elements, forms, workflows
4. **Generates** end-user documentation automatically

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  FastAPI     │────▶│   PostgreSQL    │
│  (React)    │     │   Backend    │     │   (Data)        │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│    Redis     │  │   Celery     │  │  Archive Store  │
│   (Queue)    │  │   Workers    │  │  (Snapshots)    │
└──────────────┘  └──────────────┘  └─────────────────┘
```

## Prerequisites

```bash
# macOS
brew install docker docker-compose node

# Ubuntu/Debian
sudo apt-get install docker.io docker-compose nodejs npm

# Verify installations
docker --version      # Should show 20.10+
docker-compose version # Should show 2.x
node --version        # Should show 18+
```

## Step 1: Start All Services

```bash
# Navigate to project
cd /Users/satvik.batra/Documents/juspay/floww

# Start everything (first time will build images)
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

**Services will be available at:**
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs
- Grafana: http://localhost:3000 (admin/admin)
- Prometheus: http://localhost:9090
- Flower (Celery): http://localhost:5555
- Neo4j: http://localhost:7474

## Step 2: Create Your First Project

### Option A: Via Frontend (Recommended)

1. Open http://localhost:5173
2. Click "New Project"
3. Fill in:
   - **Name**: "My App Docs"
   - **Base URL**: `https://example.com` (or your app)
   - **Description**: Optional
4. Click "Create"

### Option B: Via API

```bash
# Get auth token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@floww.dev","password":"admin123"}'

# Create project
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My App",
    "base_url": "https://example.com",
    "config": {
      "max_pages": 50,
      "output_formats": ["markdown", "html"]
    }
  }'
```

## Step 3: Start Crawling

### From Frontend

1. Go to your project
2. Click "Start Crawl" button
3. Watch progress in real-time via WebSocket

### From API

```bash
curl -X POST http://localhost:8000/api/v1/projects/{PROJECT_ID}/crawl \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**What happens during crawl:**
1. Celery worker launches browser (Playwright)
2. Navigates to base URL
3. Discovers links and forms
4. Takes screenshots
5. Saves HTML + resources
6. Builds knowledge graph
7. Generates documentation

## Step 4: Monitor Progress

### Real-time (Flower)

Open http://localhost:5555 to see:
- Active tasks
- Task success/failure rates
- Worker status
- Queue depth

### Metrics (Grafana)

Open http://localhost:3000

**Key dashboards to create:**

1. **Request Rate**
   ```promql
   rate(http_requests_total[5m])
   ```

2. **Crawl Progress**
   ```promql
   crawl_pages_total
   ```

3. **Queue Depth**
   ```promql
   celery_queue_length
   ```

## Step 5: View Results

### Knowledge Graph

1. In frontend, go to your project
2. Click "Knowledge Graph" tab
3. Interactive visualization shows:
   - Pages (blue boxes)
   - Forms (green hexagons)
   - Buttons (orange circles)
   - Links (cyan dots)
   - Navigation (pink stars)

### Archive Timeline

1. Click "Archive Browser"
2. View historical snapshots
3. Compare versions
4. See visual diffs

### Generated Documentation

Check `./docs/{project_id}/` for:
- `README.md` - Site overview
- `pages/*.md` - Individual page docs
- `workflows/*.md` - User workflows

## Testing on Real Applications

### Test 1: Simple Static Site

```bash
# Use httpbin.org for testing
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "name": "HTTPBin Test",
    "base_url": "https://httpbin.org",
    "config": {
      "max_pages": 10,
      "max_depth": 2
    }
  }'
```

**Expected:** Should crawl forms, tables, headers

### Test 2: React/Vue SPA

```json
{
  "name": "SPA Test",
  "base_url": "https://demo.react.example.com",
  "config": {
    "spa_mode": true,
    "wait_for_networkidle": true,
    "max_pages": 20
  }
}
```

**Expected:** Should detect route changes, capture dynamic content

### Test 3: E-commerce Site

```json
{
  "name": "E-commerce Docs",
  "base_url": "https://demo.ecommerce.example.com",
  "config": {
    "include_patterns": ["/products", "/cart", "/checkout"],
    "exclude_patterns": ["/admin", "/api"],
    "stealth_mode": true
  }
}
```

**Expected:** Should capture product pages, cart flow, checkout

## Interactive Mode (Handling Obstacles)

When Floww encounters:
- **Login forms** → Pauses, asks for credentials
- **CAPTCHA** → Pauses, asks for solution
- **Unknown forms** → Asks for sample data

**Example interaction:**
```
Crawler paused at: https://example.com/login
Type: login_form
Fields: ["username", "password"]

Floww: "Please provide login credentials or skip?"
You: Enter credentials in web UI
Floww: Resumes crawl with authenticated session
```

## Troubleshooting

### Issue: Crawler stops immediately

**Check:**
```bash
# View logs
docker-compose logs -f celery-worker

# Common fixes:
# 1. Check if site blocks bots
curl -I https://example.com/robots.txt

# 2. Enable stealth mode in config
{"stealth_mode": true}

# 3. Check if site requires auth
# Add credentials in web UI
```

### Issue: No pages discovered

**Check:**
```bash
# Verify crawler can access site
docker-compose exec api curl https://example.com

# Check rate limiting
# Increase delay: {"delay_ms": 2000}
```

### Issue: Graph is empty

**Check:**
```bash
# View crawler logs
docker-compose logs celery-worker | grep "graph"

# Ensure pages have content
ls -la archive_storage/{project_id}/
```

## Advanced Configuration

### Custom Selectors

```json
{
  "config": {
    "custom_selectors": {
      "navigation": "nav.main-menu",
      "content": "article.main-content",
      "ignore": ".ads, .cookie-banner"
    }
  }
}
```

### Authentication

**Option 1: Session Cookies**
```json
{
  "config": {
    "cookies": {
      "session_id": "abc123",
      "auth_token": "xyz789"
    }
  }
}
```

**Option 2: Basic Auth**
```json
{
  "config": {
    "auth": {
      "type": "basic",
      "username": "admin",
      "password": "secret"
    }
  }
}
```

**Option 3: OAuth**
Use browser extension to capture authenticated session

## Performance Tuning

### For Large Sites (1000+ pages)

```json
{
  "config": {
    "max_pages": 1000,
    "max_depth": 5,
    "concurrency": 4,
    "delay_ms": 500,
    "batch_size": 50
  }
}
```

### Resource Limits

```bash
# In docker-compose.yml, add to celery-worker:
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
```

## Next Steps

1. **Customize Documentation Templates**
   - Edit `src/floww/graph/doc_generator.py`
   - Modify markdown templates

2. **Add Custom Extractors**
   - Extend `GraphBuilder` class
   - Extract domain-specific elements

3. **Integrate LLM**
   - Add OpenAI/Anthropic API keys
   - Enable AI-generated descriptions

4. **Production Deployment**
   - Use managed PostgreSQL
   - Set up Redis Cluster
   - Deploy to Kubernetes

## Quick Reference

| Command | Description |
|---------|-------------|
| `docker-compose up` | Start all services |
| `docker-compose logs -f api` | View API logs |
| `docker-compose logs -f celery-worker` | View worker logs |
| `docker-compose ps` | List running containers |
| `docker-compose down` | Stop all services |
| `docker-compose down -v` | Stop and remove volumes |

## Support

- API Docs: http://localhost:8000/docs
- Metrics: http://localhost:8000/metrics
- Health: http://localhost:8000/health
