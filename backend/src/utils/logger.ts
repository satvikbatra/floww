/**
 * Structured Logger — Production-grade logging with levels, context, and JSON output
 *
 * Replaces all console.log throughout the codebase.
 * In production: JSON format for log aggregation (ELK, Datadog, CloudWatch)
 * In development: human-readable colored output
 */

import { appConfig } from '../config/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  fatal: '\x1b[41m',  // red background
}

const RESET = '\x1b[0m'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: string
  data?: Record<string, any>
  error?: { message: string; stack?: string; name: string }
  requestId?: string
  userId?: string
  duration?: number
}

class Logger {
  private minLevel: LogLevel
  private isJson: boolean
  private context: string

  constructor(context: string = 'app') {
    this.context = context
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (appConfig.app.isProd ? 'info' : 'debug')
    this.isJson = appConfig.app.isProd
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): Logger {
    const child = new Logger(`${this.context}:${context}`)
    return child
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, any>): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined
    this.log('error', message, {
      ...data,
      ...(err && { error: { message: err.message, name: err.name, stack: err.stack } }),
    })
  }

  fatal(message: string, error?: Error | unknown, data?: Record<string, any>): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined
    this.log('fatal', message, {
      ...data,
      ...(err && { error: { message: err.message, name: err.name, stack: err.stack } }),
    })
  }

  /**
   * Log with timing — returns a function that logs the duration when called
   */
  time(message: string, data?: Record<string, any>): () => void {
    const start = Date.now()
    return () => {
      const duration = Date.now() - start
      this.log('info', message, { ...data, duration })
    }
  }

  private log(level: LogLevel, message: string, data?: Record<string, any>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    }

    // Extract special fields
    if (data?.error) {
      entry.error = data.error
      delete entry.data?.error
    }
    if (data?.requestId) {
      entry.requestId = data.requestId
      delete entry.data?.requestId
    }
    if (data?.userId) {
      entry.userId = data.userId
      delete entry.data?.userId
    }
    if (data?.duration !== undefined) {
      entry.duration = data.duration
      delete entry.data?.duration
    }

    // Clean empty data
    if (entry.data && Object.keys(entry.data).length === 0) {
      delete entry.data
    }

    if (this.isJson) {
      this.writeJson(entry)
    } else {
      this.writePretty(entry)
    }
  }

  private writeJson(entry: LogEntry): void {
    const stream = entry.level === 'error' || entry.level === 'fatal' ? process.stderr : process.stdout
    stream.write(JSON.stringify(entry) + '\n')
  }

  private writePretty(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level]
    const levelStr = entry.level.toUpperCase().padEnd(5)
    const ctx = entry.context ? ` [${entry.context}]` : ''
    const dur = entry.duration !== undefined ? ` (${entry.duration}ms)` : ''

    let line = `${color}${levelStr}${RESET} ${entry.timestamp.substring(11, 23)}${ctx} ${entry.message}${dur}`

    if (entry.data) {
      line += ` ${JSON.stringify(entry.data)}`
    }

    if (entry.error) {
      line += `\n  ${LEVEL_COLORS.error}${entry.error.name}: ${entry.error.message}${RESET}`
      if (entry.error.stack && entry.level === 'fatal') {
        line += `\n  ${entry.error.stack.split('\n').slice(1, 5).join('\n  ')}`
      }
    }

    const stream = entry.level === 'error' || entry.level === 'fatal' ? process.stderr : process.stdout
    stream.write(line + '\n')
  }
}

// Default logger instance
export const logger = new Logger('floww')

// Pre-built child loggers for common contexts
export const crawlLogger = logger.child('crawl')
export const apiLogger = logger.child('api')
export const dbLogger = logger.child('db')
export const wsLogger = logger.child('ws')
export const archiveLogger = logger.child('archive')
export const graphLogger = logger.child('graph')
export const authLogger = logger.child('auth')
