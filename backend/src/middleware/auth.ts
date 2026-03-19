import { Context, Next } from 'hono'
import { db } from '../db/client'
import { verifyToken } from '../utils/auth'
import { UnauthorizedError } from '../utils/errors'
import { appConfig } from '../config/env'
import type { User } from '@prisma/client'

// Extend Hono context to include user
declare module 'hono' {
  interface ContextVariableMap {
    user: User
  }
}

// Auth middleware - requires valid JWT
export const requireAuth = async (c: Context, next: Next) => {
  // Development bypass
  if (appConfig.auth.disableAuth) {
    // Get or create admin user for dev
    let admin = await db.user.findUnique({
      where: { email: 'admin@floww.dev' },
    })

    if (!admin) {
      const { hashPassword } = await import('../utils/auth')
      admin = await db.user.create({
        data: {
          email: 'admin@floww.dev',
          username: 'admin',
          hashedPassword: await hashPassword('admin123'),
          fullName: 'Admin User',
          role: 'ADMIN',
          isSuperuser: true,
        },
      })
    }

    c.set('user', admin)
    return next()
  }

  // Get token from Authorization header
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided')
  }

  const token = authHeader.slice(7) // Remove 'Bearer '

  try {
    // Verify token
    const payload = verifyToken(token)

    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type')
    }

    // Get user from database
    const user = await db.user.findUnique({
      where: { id: payload.sub },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive')
    }

    // Attach user to context
    c.set('user', user)

    return next()
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token')
  }
}

// Optional auth - doesn't throw, just sets user if token is valid
export const optionalAuth = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization')

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)

    try {
      const payload = verifyToken(token)
      const user = await db.user.findUnique({
        where: { id: payload.sub },
      })

      if (user && user.isActive) {
        c.set('user', user)
      }
    } catch {
      // Silently fail for optional auth
    }
  }

  return next()
}

// Admin only middleware
export const requireAdmin = async (c: Context, next: Next) => {
  const user = c.get('user')

  if (!user || user.role !== 'ADMIN') {
    throw new UnauthorizedError('Admin access required')
  }

  return next()
}
