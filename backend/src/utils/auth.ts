import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { appConfig } from '../config/env'
import type { User } from '@prisma/client'

const SALT_ROUNDS = 10

// Password hashing
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

// JWT Token types
export interface TokenPayload {
  sub: string // user ID
  email: string
  role: string
  type: 'access' | 'refresh'
}

// Create access token
export const createAccessToken = (user: User): string => {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  }

  return (jwt.sign as any)(payload, appConfig.auth.jwtSecret, {
    expiresIn: appConfig.auth.accessTokenExpiry,
  })
}

// Create refresh token
export const createRefreshToken = (user: User): string => {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: 'refresh',
  }

  return (jwt.sign as any)(payload, appConfig.auth.jwtSecret, {
    expiresIn: appConfig.auth.refreshTokenExpiry,
  })
}

// Verify token
export const verifyToken = (token: string): TokenPayload => {
  try {
    const payload = jwt.verify(token, appConfig.auth.jwtSecret) as TokenPayload
    return payload
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

// Token expiry times in seconds
export const getTokenExpiry = (type: 'access' | 'refresh'): number => {
  const expiry =
    type === 'access'
      ? appConfig.auth.accessTokenExpiry
      : appConfig.auth.refreshTokenExpiry

  // Parse string like "30m" or "7d" to seconds
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match) return 1800 // default 30min

  const value = parseInt(match[1])
  const unit = match[2]

  switch (unit) {
    case 's':
      return value
    case 'm':
      return value * 60
    case 'h':
      return value * 60 * 60
    case 'd':
      return value * 60 * 60 * 24
    default:
      return 1800
  }
}
