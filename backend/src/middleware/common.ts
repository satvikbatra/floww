import { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { appConfig } from '../config/env'

// CORS middleware
export const corsMiddleware = cors({
  origin: appConfig.cors.origins,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})

// Request logger
export const logger = honoLogger((message) => {
  console.log(`[${new Date().toISOString()}] ${message}`)
})

// Request timing
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
  }
}
