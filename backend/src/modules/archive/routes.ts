import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { archiveService } from '../../services/archive/storage'

const archive = new Hono()

// Get snapshots for a project
archive.get('/:projectId/archive/snapshots', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const url = c.req.query('url')

  // Verify project
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  // Get snapshots from storage
  const snapshots = url
    ? await archiveService.getTimeline(projectId, url)
    : await archiveService.getAllSnapshots(projectId)

  return c.json({
    snapshots,
    total: snapshots.length,
  })
})

// Get single snapshot
archive.get('/:projectId/archive/snapshots/:snapshotId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const snapshotId = c.req.param('snapshotId')!

  // Verify project
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  // Get from database
  const snapshot = await db.snapshot.findFirst({
    where: {
      id: snapshotId,
      projectId,
    },
  })

  if (!snapshot) {
    throw new NotFoundError('Snapshot not found')
  }

  return c.json(snapshot)
})

// Get timeline for a specific URL
archive.get('/:projectId/archive/timeline/:urlHash', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const urlHash = c.req.param('urlHash')!

  // Verify project
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  // Get snapshots with this URL hash
  const snapshots = await db.snapshot.findMany({
    where: {
      projectId,
      pageUrlHash: urlHash,
    },
    orderBy: {
      capturedAt: 'asc',
    },
  })

  return c.json({
    urlHash,
    snapshots,
    total: snapshots.length,
  })
})

// Compare two snapshots
archive.post('/:projectId/archive/compare', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const body = await c.req.json()
  const { snapshotAId, snapshotBId } = body

  // Verify project
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  // Get snapshots
  const [snapshotA, snapshotB] = await Promise.all([
    db.snapshot.findFirst({ where: { id: snapshotAId, projectId } }),
    db.snapshot.findFirst({ where: { id: snapshotBId, projectId } }),
  ])

  if (!snapshotA || !snapshotB) {
    throw new NotFoundError('One or both snapshots not found')
  }

  // Simple comparison based on hashes
  const diff = {
    textChanged: snapshotA.contentHash !== snapshotB.contentHash,
    visualChanged: snapshotA.visualHash !== snapshotB.visualHash,
    httpStatusChanged: snapshotA.httpStatus !== snapshotB.httpStatus,
    timeDiff: Math.abs(
      snapshotA.capturedAt.getTime() - snapshotB.capturedAt.getTime()
    ),
  }

  return c.json({
    snapshotA: {
      id: snapshotA.id,
      url: snapshotA.pageUrl,
      capturedAt: snapshotA.capturedAt,
    },
    snapshotB: {
      id: snapshotB.id,
      url: snapshotB.pageUrl,
      capturedAt: snapshotB.capturedAt,
    },
    diff,
  })
})

// Get archive stats
archive.get('/:projectId/archive/stats', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!

  // Verify project
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const stats = await archiveService.getStats(projectId)

  return c.json(stats)
})

export default archive
