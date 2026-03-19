import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

// Custom error class
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

// Predefined errors
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error') {
    super(400, message)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, message)
  }
}

// Global error handler middleware
export const errorHandler = (err: Error, c: Context) => {
  console.error('Error:', err)

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: err.message,
        statusCode: err.statusCode,
      },
      err.statusCode
    )
  }

  // Unknown errors
  return c.json(
    {
      error: 'Internal server error',
      message: err.message,
    },
    500
  )
}
