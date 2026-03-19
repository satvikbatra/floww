import { Hono } from 'hono'
import { db } from '../../db/client'
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  verifyPassword,
  verifyToken,
  getTokenExpiry,
} from '../../utils/auth'
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors'
import { requireAuth } from '../../middleware/auth'
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  validate,
} from '../../types/schemas'

const auth = new Hono()

// Register new user
auth.post('/register', async (c) => {
  const body = await c.req.json()
  const data = validate(registerSchema, body)

  // Check if user exists
  const existing = await db.user.findFirst({
    where: {
      OR: [{ email: data.email }, { username: data.username }],
    },
  })

  if (existing) {
    throw new ConflictError('User with this email or username already exists')
  }

  // Create user
  const hashedPassword = await hashPassword(data.password)
  const user = await db.user.create({
    data: {
      email: data.email,
      username: data.username,
      hashedPassword,
      fullName: data.fullName,
    },
  })

  // Generate tokens
  const accessToken = createAccessToken(user)
  const refreshToken = createRefreshToken(user)

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
    accessToken,
    refreshToken,
    tokenType: 'bearer',
    expiresIn: getTokenExpiry('access'),
  }, 201)
})

// Login
auth.post('/login', async (c) => {
  const body = await c.req.json()
  const data = validate(loginSchema, body)

  // Find user
  const user = await db.user.findUnique({
    where: { email: data.email },
  })

  if (!user || !(await verifyPassword(data.password, user.hashedPassword))) {
    throw new UnauthorizedError('Invalid email or password')
  }

  if (!user.isActive) {
    throw new UnauthorizedError('User account is disabled')
  }

  // Generate tokens
  const accessToken = createAccessToken(user)
  const refreshToken = createRefreshToken(user)

  return c.json({
    accessToken,
    refreshToken,
    tokenType: 'bearer',
    expiresIn: getTokenExpiry('access'),
  })
})

// Refresh access token
auth.post('/refresh', async (c) => {
  const body = await c.req.json()
  const data = validate(refreshTokenSchema, body)

  try {
    const payload = verifyToken(data.refreshToken)

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type')
    }

    const user = await db.user.findUnique({
      where: { id: payload.sub },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive')
    }

    // Generate new tokens
    const accessToken = createAccessToken(user)
    const refreshToken = createRefreshToken(user)

    return c.json({
      accessToken,
      refreshToken,
      tokenType: 'bearer',
      expiresIn: getTokenExpiry('access'),
    })
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }
})

// Get current user
auth.get('/me', requireAuth, async (c) => {
  const user = c.get('user')

  return c.json({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
  })
})

export default auth
