import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import {
  createProjectSchema,
  updateProjectSchema,
  validate,
  projectConfigSchema,
} from '../../types/schemas'

const projects = new Hono()

// Create project
projects.post('/', requireAuth, async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const data = validate(createProjectSchema, body)

  const config = data.config || projectConfigSchema.parse({})

  const project = await db.project.create({
    data: {
      ownerId: user.id,
      name: data.name,
      description: data.description,
      baseUrl: data.baseUrl,
      config: config as any,
    },
  })

  return c.json(project, 201)
})

// List projects
projects.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  const page = parseInt(c.req.query('page') || '1')
  const pageSize = parseInt(c.req.query('page_size') || '20')

  const skip = (page - 1) * pageSize

  const [projects, total] = await Promise.all([
    db.project.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.project.count({ where: { ownerId: user.id } }),
  ])

  return c.json({
    projects,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
})

// Get single project
projects.get('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!

  const project = await db.project.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  return c.json(project)
})

// Update project
projects.patch('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const body = await c.req.json()
  const data = validate(updateProjectSchema, body)

  const existing = await db.project.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  })

  if (!existing) {
    throw new NotFoundError('Project not found')
  }

  const project = await db.project.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.baseUrl && { baseUrl: data.baseUrl }),
      ...(data.config && { config: data.config as any }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  return c.json(project)
})

// Delete project
projects.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!

  const project = await db.project.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  await db.project.delete({ where: { id } })

  return c.json({ message: 'Project deleted successfully' })
})

// Get project statistics
projects.get('/:id/stats', requireAuth, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!

  const project = await db.project.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  })

  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const [crawlSessions, documents, snapshots] = await Promise.all([
    db.crawlSession.count({ where: { projectId: id } }),
    db.document.count({ where: { projectId: id } }),
    db.snapshot.count({ where: { projectId: id } }),
  ])

  return c.json({
    crawlSessions,
    documents,
    snapshots,
  })
})

export default projects
