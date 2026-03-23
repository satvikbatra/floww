import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { appConfig } from './config/env'
import { db, disconnectDB } from './db/client'
import { errorHandler } from './utils/errors'
import { logger as appLogger, apiLogger, wsLogger } from './utils/logger'
import {
  corsMiddleware,
  logger as honoLogger,
  requestTiming,
} from './middleware/common'
import { apiRateLimit, authRateLimit, crawlRateLimit, documentRateLimit } from './middleware/rate-limit'
import { verifyToken } from './utils/auth'

// Route modules
import auth from './modules/auth/routes'
import projects from './modules/projects/routes'
import crawl from './modules/crawl/routes'
import archive from './modules/archive/routes'
import graph from './modules/graph/routes'
import documents from './modules/documents/routes'
import analysis from './modules/analysis/routes'
import { wsEventManager } from './services/events/websocket-manager'
import { CrawlerService } from './modules/crawl/service'
import { metrics } from './services/monitoring/metrics'
import { startUsageTracking, stopUsageTracking } from './services/metering/usage-tracker'

const app = new Hono()

// Global middleware
app.use('*', honoLogger)
app.use('*', corsMiddleware)
app.use('*', requestTiming)
app.use('/api/*', apiRateLimit)

// Stricter rate limits for sensitive endpoints
app.use('/api/v1/auth/*', authRateLimit)

// Health checks (no rate limit)
app.get('/health', (c) => c.json({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  environment: appConfig.app.env,
  version: appConfig.app.version,
}))

app.get('/healthz', (c) => c.json({ status: 'ok' }))

app.get('/readyz', async (c) => {
  const checks: Record<string, string> = {}

  // Database check
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch (error) {
    checks.database = `failed: ${String(error).substring(0, 100)}`
  }

  // Redis check (if configured)
  if (appConfig.redis.url) {
    try {
      // Simple check — just verify URL is set
      checks.redis = 'configured'
    } catch {
      checks.redis = 'failed'
    }
  } else {
    checks.redis = 'not configured'
  }

  // Storage directories
  const fs = await import('fs')
  checks.storage = fs.existsSync(appConfig.storage.basePath) ? 'ok' : 'missing'
  checks.archive = fs.existsSync(appConfig.storage.archivePath) ? 'ok' : 'will be created'

  const allOk = checks.database === 'ok'
  return c.json({ status: allOk ? 'ready' : 'not ready', checks }, allOk ? 200 : 503)
})

// API routes with per-section rate limits
app.route('/api/v1/auth', auth)
app.route('/api/v1/projects', projects)
app.route('/api/v1/projects', crawl)
app.route('/api/v1/projects', archive)
app.route('/api/v1/projects', graph)
app.route('/api/v1/projects', documents)
app.route('/api/v1/projects', analysis)

// Prometheus metrics endpoint
app.get('/metrics', (c) => {
  return new Response(metrics.toPrometheus(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
})

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: appConfig.app.name,
    version: appConfig.app.version,
    environment: appConfig.app.env,
    endpoints: {
      health: '/health',
      ready: '/readyz',
      api: '/api/v1',
      websocket: `ws://localhost:${appConfig.app.port}/api/v1/ws/crawl/{sessionId}`,
    },
  })
})

// Error handling
app.onError(errorHandler)

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', path: c.req.path }, 404)
})

// --- Graceful Shutdown ---
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  appLogger.info(`Received ${signal}, starting graceful shutdown...`)

  // Stop accepting new connections
  server.close()

  // Cancel active crawls
  const activeCrawlerIds = Array.from((CrawlerService as any).activeCrawlers?.keys?.() || [])
  for (const sessionId of activeCrawlerIds) {
    const active = CrawlerService.getActiveCrawler(sessionId as string)
    if (active?.crawler) {
      appLogger.info(`Cancelling active crawl: ${sessionId}`)
      await active.crawler.cancel().catch(() => {})
    }
  }

  // Close WebSocket connections
  wss.clients.forEach(ws => ws.close())

  // Stop usage tracking
  await stopUsageTracking()

  // Disconnect database
  await disconnectDB()

  appLogger.info('Shutdown complete')
  process.exit(0)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// --- Start Server ---
const port = appConfig.app.port

appLogger.info('Starting Floww Backend API', {
  version: appConfig.app.version,
  environment: appConfig.app.env,
  port,
  authDisabled: appConfig.auth.disableAuth,
})

// Start usage tracking
startUsageTracking()

const server = serve({ fetch: app.fetch, port })

// --- WebSocket Server with Auth ---
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (request, socket, head) => {
  const url = request.url || ''
  const match = url.match(/\/api\/v1\/ws\/crawl\/([^/?]+)/)

  if (!match) {
    socket.destroy()
    return
  }

  const sessionId = match[1]

  // Auth check — verify token from query param or header
  if (!appConfig.auth.disableAuth) {
    try {
      const urlObj = new URL(url, `http://localhost:${port}`)
      const token = urlObj.searchParams.get('token') || ''
      if (!token) {
        wsLogger.warn('WebSocket connection rejected: no token', { sessionId })
        socket.destroy()
        return
      }
      const payload = verifyToken(token)
      // Verify the user owns this crawl session
      const session = await db.crawlSession.findFirst({
        where: { id: sessionId },
        include: { project: true },
      })
      if (!session || session.project.ownerId !== payload.sub) {
        wsLogger.warn('WebSocket connection rejected: unauthorized', { sessionId, userId: payload.sub })
        socket.destroy()
        return
      }
    } catch (error) {
      wsLogger.warn('WebSocket auth failed', { sessionId, error: String(error) })
      socket.destroy()
      return
    }
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wsLogger.info('WebSocket connected', { sessionId })
    wsEventManager.registerConnection(sessionId, ws)

    ws.on('close', () => {
      wsEventManager.unregisterConnection(sessionId)
      wsLogger.debug('WebSocket disconnected', { sessionId })
    })

    ws.on('error', (err) => {
      wsLogger.error('WebSocket error', err, { sessionId })
    })

    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      timestamp: new Date(),
    }))
  })
})

appLogger.info('Server started', {
  http: `http://localhost:${port}`,
  ws: `ws://localhost:${port}/api/v1/ws/crawl/{sessionId}`,
})
