import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { validate, generateDocumentSchema } from '../../types/schemas'
import { graphManager } from '../../services/graph/knowledge-graph'
import { documentGenerator } from '../../services/documents/generator'
import { promises as fs } from 'fs'
import path from 'path'
import { appConfig } from '../../config/env'

const documents = new Hono()

// Generate documentation
documents.post('/:projectId/documents', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const body = await c.req.json()
  const data = validate(generateDocumentSchema, body)

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const doc = await db.document.create({
    data: {
      projectId,
      userId: user.id,
      crawlSessionId: data.crawlSessionId,
      title: data.title,
      description: data.description,
      format: data.format,
      status: 'GENERATING',
    },
  })

  // Generate documentation in background
  ;(async () => {
    try {
      const kg = await graphManager.getGraph(projectId)

      const result = await documentGenerator.generateFullDocumentation(kg, {
        projectId,
        projectName: project.name,
        projectUrl: project.baseUrl,
        crawlSessionId: data.crawlSessionId || undefined,
        format: data.format as 'MARKDOWN' | 'HTML',
        includeScreenshots: (data as any).includeScreenshots !== false,
        includeAiAnalysis: (data as any).includeAiAnalysis !== false,
        language: (data as any).language || 'en',
      })

      await db.document.update({
        where: { id: doc.id },
        data: {
          status: 'COMPLETED',
          outputPath: result.outputPath,
          size: Buffer.byteLength(result.content, 'utf-8'),
          generatedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('Document generation failed:', error)
      await db.document.update({
        where: { id: doc.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    }
  })().catch((err) => {
    console.error('Document generation background task crashed:', err)
  })

  return c.json(doc, 201)
})

// List documents
documents.get('/:projectId/documents', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const docs = await db.document.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })

  return c.json({ documents: docs, total: docs.length })
})

// Get single document metadata
documents.get('/:projectId/documents/:documentId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const documentId = c.req.param('documentId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })
  if (!project) throw new NotFoundError('Project not found')

  const doc = await db.document.findFirst({
    where: { id: documentId, projectId },
  })
  if (!doc) throw new NotFoundError('Document not found')

  return c.json(doc)
})

// Download document content
documents.get('/:projectId/documents/:documentId/content', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const documentId = c.req.param('documentId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })
  if (!project) throw new NotFoundError('Project not found')

  const doc = await db.document.findFirst({
    where: { id: documentId, projectId },
  })
  if (!doc || !doc.outputPath) throw new NotFoundError('Document not found or not generated yet')

  // Path traversal protection — ensure outputPath is within expected directory
  const resolvedPath = path.resolve(doc.outputPath)
  const allowedBase = path.resolve(appConfig.storage.outputPath)
  if (!resolvedPath.startsWith(allowedBase)) {
    throw new NotFoundError('Document file path is invalid')
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8')
    const contentType = doc.format === 'HTML' ? 'text/html'
      : doc.format === 'JSON' ? 'application/json'
      : 'text/markdown'

    return new Response(content, {
      headers: {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${doc.title}.${doc.format === 'HTML' ? 'html' : 'md'}"`,
      },
    })
  } catch {
    throw new NotFoundError('Document file not found on disk')
  }
})

// Delete document
documents.delete('/:projectId/documents/:documentId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')!
  const documentId = c.req.param('documentId')!

  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: user.id },
  })
  if (!project) throw new NotFoundError('Project not found')

  const doc = await db.document.findFirst({
    where: { id: documentId, projectId },
  })
  if (!doc) throw new NotFoundError('Document not found')

  if (doc.outputPath) {
    try { await fs.unlink(doc.outputPath) } catch {}
  }

  await db.document.delete({ where: { id: documentId } })
  return c.json({ message: 'Document deleted' })
})

export default documents
