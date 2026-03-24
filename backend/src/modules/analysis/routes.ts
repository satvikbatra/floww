import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { analysisService } from '../../services/ai/analysis-service'

const analysis = new Hono()

// Start analysis for a project
analysis.post('/:projectId/analyze', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const body = await c.req.json().catch(() => ({}))
  const crawlSessionId = (body as any).crawlSessionId

  // Start analysis in background — log errors
  analysisService.analyzeSession(projectId, crawlSessionId).catch((error) => {
    console.error('Analysis failed:', error)
  })

  return c.json({
    message: 'Analysis started',
    projectId,
    crawlSessionId: crawlSessionId || 'latest',
  })
})

// Get analysis progress
analysis.get('/:projectId/analyze/status', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const progress = analysisService.getProgress(projectId)

  // Also count from DB
  const [totalSnapshots, analyzedSnapshots] = await Promise.all([
    db.snapshot.count({ where: { projectId } }),
    db.snapshot.count({ where: { projectId, NOT: { analysisJson: { equals: Prisma.DbNull } } } }),
  ])

  return c.json({
    ...progress,
    dbTotal: totalSnapshots,
    dbAnalyzed: analyzedSnapshots,
  })
})

// Get analysis results for a project
analysis.get('/:projectId/analyze/results', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const snapshots = await db.snapshot.findMany({
    where: { projectId, NOT: { analysisJson: { equals: Prisma.DbNull } } },
    select: {
      id: true,
      pageUrl: true,
      pageTitle: true,
      analysisJson: true,
      screenshotPath: true,
      capturedAt: true,
    },
    orderBy: { capturedAt: 'asc' },
  })

  return c.json({
    results: snapshots.map(s => ({
      snapshotId: s.id,
      url: s.pageUrl,
      title: s.pageTitle,
      analysis: s.analysisJson,
      screenshotPath: s.screenshotPath,
      capturedAt: s.capturedAt,
    })),
    total: snapshots.length,
  })
})

export default analysis
