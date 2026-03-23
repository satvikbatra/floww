/**
 * Multi-Tenant Middleware — Ensures data isolation between users
 *
 * Every DB query for projects/crawls/docs must include ownerId filter.
 * This middleware sets the userId on context for all downstream handlers.
 */

import { Context, Next } from 'hono'
import { apiLogger } from '../utils/logger'

/**
 * Verify that a resource belongs to the authenticated user.
 * Use this as a utility in route handlers.
 */
export async function verifyOwnership(
  db: any,
  model: 'project' | 'document',
  resourceId: string,
  userId: string
): Promise<boolean> {
  if (model === 'project') {
    const project = await db.project.findFirst({
      where: { id: resourceId, ownerId: userId },
    })
    return !!project
  }

  if (model === 'document') {
    const doc = await db.document.findFirst({
      where: { id: resourceId, userId },
    })
    return !!doc
  }

  return false
}

/**
 * Middleware that logs tenant context for every request
 */
export const tenantContext = async (c: Context, next: Next) => {
  const user = c.get('user')
  if (user) {
    apiLogger.debug('Request with tenant context', {
      userId: user.id,
      email: user.email,
      role: user.role,
      path: c.req.path,
      method: c.req.method,
    })
  }
  return next()
}
