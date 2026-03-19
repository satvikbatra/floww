import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { validate, generateDocumentSchema } from '../../types/schemas'
import { graphManager } from '../../services/graph/knowledge-graph'
import { documentGenerator } from '../../services/documents/generator'
import path from 'path'

const documents = new Hono()

// Generate documentation
documents.post('/:projectId/documents', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const body = await c.req.json()
  const data = validate(generateDocumentSchema, body)

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

  // Create document record
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
      // Get knowledge graph
      const kg = await graphManager.getGraph(projectId)

      // Generate markdown
      const markdown = await documentGenerator.generateMarkdown(
        project.name,
        project.baseUrl,
        kg
      )

      let content = markdown
      let filename = `${doc.id}.md`

      // Convert to other formats if needed
      if (data.format === 'HTML') {
        content = await documentGenerator.generateHTML(markdown)
        filename = `${doc.id}.html`
      }

      // Save to disk
      const outputPath = await documentGenerator.save(content, projectId, filename)

      // Update document record
      await db.document.update({
        where: { id: doc.id },
        data: {
          status: 'COMPLETED',
          outputPath,
          size: content.length,
          generatedAt: new Date(),
        },
      })
    } catch (error) {
      await db.document.update({
        where: { id: doc.id },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    }
  })()

  return c.json(doc, 201)
})

// List documents
documents.get('/:projectId/documents', requireAuth, async (c) => {
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

  const docs = await db.document.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })

  return c.json({
    documents: docs,
    total: docs.length,
  })
})

// Get single document
documents.get('/:projectId/documents/:documentId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const documentId = c.req.param('documentId')

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

  const doc = await db.document.findFirst({
    where: {
      id: documentId,
      projectId,
    },
  })

  if (!doc) {
    throw new NotFoundError('Document not found')
  }

  return c.json(doc)
})

// Delete document
documents.delete('/:projectId/documents/:documentId', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const documentId = c.req.param('documentId')

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

  const doc = await db.document.findFirst({
    where: {
      id: documentId,
      projectId,
    },
  })

  if (!doc) {
    throw new NotFoundError('Document not found')
  }

  await db.document.delete({ where: { id: documentId } })

  return c.json({ message: 'Document deleted' })
})

export default documents
