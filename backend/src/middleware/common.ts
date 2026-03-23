import { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { appConfig } from '../config/env'
import { apiLogger } from '../utils/logger'
import { metrics } from '../services/monitoring/metrics'

// CORS middleware
export const corsMiddleware = cors({
  origin: appConfig.cors.origins,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})

// Request logger using structured logger
export const logger = async (c: Context, next: Next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const status = c.res.status

  // Track metrics
  metrics.increment('floww_http_requests_total', `${c.req.method} ${status}`, 'Total HTTP requests')
  metrics.observe('floww_http_request_duration_seconds', ms / 1000, 'HTTP request duration')

  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  apiLogger[level](`${c.req.method} ${c.req.path} ${status}`, {
    method: c.req.method,
    path: c.req.path,
    status,
    duration: ms,
  })
}

// Request timing header
export const requestTiming = async (c: Context, next: Next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  c.res.headers.set('X-Response-Time', `${ms}ms`)
}

// Health check data
export const healthCheck = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: appConfig.app.env,
    version: appConfig.app.version,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  }
}
