/**
 * Audit Logger — Records security-relevant actions for compliance
 *
 * Tracks: user logins, project modifications, crawl starts/stops,
 * document access, admin actions.
 */

import { apiLogger } from '../../utils/logger'

export type AuditAction =
  | 'auth.login'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.token_refresh'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'crawl.start'
  | 'crawl.cancel'
  | 'crawl.complete'
  | 'document.generate'
  | 'document.download'
  | 'document.delete'
  | 'analysis.start'
  | 'admin.user_modify'
  | 'admin.settings_change'

export interface AuditEntry {
  action: AuditAction
  userId?: string
  userEmail?: string
  resourceType?: string
  resourceId?: string
  ip?: string
  userAgent?: string
  details?: Record<string, any>
  timestamp: Date
}

// In-memory buffer for batch writing
const auditBuffer: AuditEntry[] = []
const MAX_BUFFER = 50

/**
 * Record an audit event
 */
export function audit(entry: Omit<AuditEntry, 'timestamp'>): void {
  const full: AuditEntry = {
    ...entry,
    timestamp: new Date(),
  }

  auditBuffer.push(full)

  // Always log audit events to structured logger immediately
  apiLogger.info(`AUDIT: ${entry.action}`, {
    userId: entry.userId,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    ip: entry.ip,
    ...(entry.details || {}),
  })

  // Flush if buffer is full
  if (auditBuffer.length >= MAX_BUFFER) {
    flushAuditLog().catch(() => {})
  }
}

/**
 * Flush audit buffer
 * In production, this would write to a dedicated audit_log table or external service
 */
export async function flushAuditLog(): Promise<void> {
  if (auditBuffer.length === 0) return
  const entries = auditBuffer.splice(0, auditBuffer.length)

  // For now, entries are already logged via apiLogger.info
  // When audit_log table is added to Prisma schema:
  // await db.auditLog.createMany({ data: entries })

  apiLogger.debug('Audit log flushed', { count: entries.length })
}

/**
 * Get recent audit entries (from buffer — for real-time monitoring)
 */
export function getRecentAuditEntries(limit: number = 50): AuditEntry[] {
  return auditBuffer.slice(-limit)
}

/**
 * Helper to extract request context for audit entries
 */
export function getRequestContext(c: any): { ip: string; userAgent: string } {
  return {
    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    userAgent: c.req.header('user-agent') || 'unknown',
  }
}
