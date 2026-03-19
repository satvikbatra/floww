import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { appConfig } from './config/env'
import { db, disconnectDB } from './db/client'
import { errorHandler } from './utils/errors'
import {
  corsMiddleware,
  logger,
  requestTiming,
  healthCheck,
} from './middleware/common'

// Import route modules
import auth from './modules/auth/routes'
import projects from './modules/projects/routes'
import crawl from './modules/crawl/routes'
import archive from './modules/archive/routes'
import graph from './modules/graph/routes'
import documents from './modules/documents/routes'

// Initialize app
const app = new Hono()

// Global middleware
app.use('*', logger)
app.use('*', corsMiddleware)
app.use('*', requestTiming)

// Health check
app.get('/health', (c) => c.json(healthCheck()))
app.get('/healthz', (c) => c.json({ status: 'ok' }))
app.get('/readyz', async (c) => {
  try {
    // Test database connection
    await db.$queryRaw`SELECT 1`
    return c.json({ status: 'ready' })
  } catch (error) {
    return c.json({ status: 'not ready', error: String(error) }, 503)
  }
})

// API routes
app.route('/api/v1/auth', auth)
app.route('/api/v1/projects', projects)
app.route('/api/v1/projects', crawl)
app.route('/api/v1/projects', archive)
app.route('/api/v1/projects', graph)
app.route('/api/v1/projects', documents)

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: appConfig.app.name,
    version: appConfig.app.version,
    environment: appConfig.app.env,
    docs: '/api/v1',
  })
})

// Error handling
app.onError(errorHandler)

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...')
  await disconnectDB()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...')
  await disconnectDB()
  process.exit(0)
})

// Start server
const port = appConfig.app.port

console.log(`
╔═══════════════════════════════════════╗
║   🚀 Floww Backend API                ║
║   Version: ${appConfig.app.version.padEnd(27)}║
║   Environment: ${appConfig.app.env.padEnd(23)}║
║   Port: ${port.toString().padEnd(30)}║
╚═══════════════════════════════════════╝

🌐 Server running at: http://localhost:${port}
📚 Health check: http://localhost:${port}/health
🔐 Auth disabled: ${appConfig.auth.disableAuth}

Ready to process requests...
`)

serve({
  fetch: app.fetch,
  port,
})
