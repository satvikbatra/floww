import { Hono } from 'hono'
import { db } from '../../db/client'
import { requireAuth } from '../../middleware/auth'
import { NotFoundError } from '../../utils/errors'
import { graphManager, NodeType } from '../../services/graph/knowledge-graph'

const graph = new Hono()

// Get graph nodes
graph.get('/:projectId/graph/nodes', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const nodeType = c.req.query('node_type') as NodeType | undefined

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

  const kg = await graphManager.getGraph(projectId)
  const allNodes = kg.export().nodes

  // Filter by type if specified
  const nodes = nodeType
    ? allNodes.filter((n) => n.type === nodeType)
    : allNodes

  return c.json({
    nodes,
    total: nodes.length,
  })
})

// Get graph edges
graph.get('/:projectId/graph/edges', requireAuth, async (c) => {
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

  const kg = await graphManager.getGraph(projectId)
  const edges = kg.export().edges

  return c.json({
    edges,
    total: edges.length,
  })
})

// Get graph statistics
graph.get('/:projectId/graph/stats', requireAuth, async (c) => {
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

  const kg = await graphManager.getGraph(projectId)
  const stats = kg.getStats()

  return c.json(stats)
})

// Get detected workflows
graph.get('/:projectId/graph/workflows', requireAuth, async (c) => {
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

  const kg = await graphManager.getGraph(projectId)
  const workflows = kg.detectWorkflows()

  return c.json({
    workflows,
    total: workflows.length,
  })
})

// Get full graph for visualization
graph.get('/:projectId/graph/visualization', requireAuth, async (c) => {
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

  const kg = await graphManager.getGraph(projectId)
  const graphData = kg.export()

  return c.json(graphData)
})

// Search graph
graph.get('/:projectId/graph/search', requireAuth, async (c) => {
  const user = c.get('user')
  const projectId = c.req.param('projectId')
  const query = c.req.query('q') || ''

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

  const kg = await graphManager.getGraph(projectId)
  const pages = kg.findPages(query)

  return c.json({
    results: pages,
    total: pages.length,
  })
})

export default graph
