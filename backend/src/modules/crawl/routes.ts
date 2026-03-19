import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { validate, startCrawlSchema } from '../../types/schemas'
import { CrawlerService } from './service'

const crawl = new Hono()

// Start new crawl
crawl.post('/:projectId/crawl', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  
  // Parse body (may be empty)
  let body = {}
  try {
    const text = await c.req.text()
    if (text) {
      body = JSON.parse(text)
    }
  } catch (e) {
    // Empty body is fine for crawl
  }
  
  const data = validate(startCrawlSchema, body)

  // Verify project exists and user owns it
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  // Merge config
  const config = {
    ...(project.config as any),
    ...(data.config || {}),
  }

  // Create crawl session
  const session = await db.crawlSession.create({
    data: {
      projectId,
      status: 'PENDING',
      pagesTotal: config.maxPages || 100,
      stateData: config,
    },
  })

  // Start crawl in background
  const crawler = new CrawlerService()
  crawler.startCrawl(session.id, project, config).catch(console.error)

  // Update status to RUNNING
  await db.crawlSession.update({
    where: { id: session.id },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  })

  return c.json(
    {
      id: session.id,
      projectId: session.projectId,
      status: 'RUNNING',
      pagesVisited: 0,
      pagesTotal: session.pagesTotal,
      startedAt: new Date(),
    },
    201
  )
})

// Get crawl sessions for project
crawl.get('/:projectId/crawl', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')

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

  const sessions = await db.crawlSession.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })

  return c.json({
    sessions,
    total: sessions.length,
  })
})

// Get crawl session status
crawl.get('/:projectId/crawl/:sessionId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const sessionId = c.req.param('sessionId')

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

  const session = await db.crawlSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
  })

  if (!session) {
    throw new NotFoundError('Crawl session not found')
  }

  return c.json(session)
})

// Cancel crawl
crawl.post('/:projectId/crawl/:sessionId/cancel', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const sessionId = c.req.param('sessionId')

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

  const session = await db.crawlSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
  })

  if (!session) {
    throw new NotFoundError('Crawl session not found')
  }

  // Update status
  await db.crawlSession.update({
    where: { id: sessionId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
  })

  return c.json({ message: 'Crawl cancelled' })
})

// User action endpoint (continue, skip, cancel) for interactive crawling
crawl.post('/action', async (c) => {
  const body = await c.req.json()
  const { sessionId, action } = body

  if (!sessionId || !action) {
    return c.json({ error: 'Missing sessionId or action' }, 400)
  }

  // Get the active crawler instance from the CrawlerService
  const activeCrawler = CrawlerService.getActiveCrawler(sessionId)
  
  if (!activeCrawler || !activeCrawler.interactiveHandler) {
    return c.json({ error: 'No active crawl session found' }, 404)
  }

  try {
    switch (action) {
      case 'continue':
        await activeCrawler.interactiveHandler.markCompleted()
        return c.json({ message: 'Continue action processed' })
      
      case 'skip':
        await activeCrawler.interactiveHandler.markSkipped()
        return c.json({ message: 'Skip action processed' })
      
      case 'cancel':
        await activeCrawler.interactiveHandler.markCancelled()
        return c.json({ message: 'Cancel action processed' })
      
      default:
        return c.json({ error: 'Invalid action' }, 400)
    }
  } catch (error: any) {
    console.error('Error processing crawl action:', error)
    return c.json({ error: error.message || 'Failed to process action' }, 500)
  }
})

export default crawl
