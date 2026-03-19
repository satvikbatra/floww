import Graph from 'graphology'
import { promises as fs } from 'fs'
import path from 'path'
import { appConfig } from '../../config/env'

// Node types in the knowledge graph
export enum NodeType {
  PAGE = 'page',
  ELEMENT = 'element',
  FORM = 'form',
  BUTTON = 'button',
  LINK = 'link',
  WORKFLOW = 'workflow',
}

// Edge types (relationships)
export enum EdgeType {
  NAVIGATES_TO = 'navigates_to',
  CONTAINS = 'contains',
  SUBMITS_TO = 'submits_to',
  REQUIRES_AUTH = 'requires_auth',
  PART_OF_WORKFLOW = 'part_of_workflow',
}

// Node attributes
export interface PageNode {
  id: string
  type: NodeType.PAGE
  url: string
  title: string
  description?: string
  requiresAuth: boolean
  httpStatus: number
  lastCrawled: Date
}

export interface ElementNode {
  id: string
  type: NodeType.ELEMENT
  elementType: 'button' | 'link' | 'form' | 'input'
  text: string
  selector?: string
  action?: string
}

export interface WorkflowNode {
  id: string
  type: NodeType.WORKFLOW
  name: string
  description?: string
  steps: string[] // Array of node IDs
}

export type GraphNode = PageNode | ElementNode | WorkflowNode

export class KnowledgeGraph {
  private graph: Graph
  private _projectId: string
  private basePath: string

  constructor(projectId: string) {
    this._projectId = projectId
    this.graph = new Graph({ multi: true, allowSelfLoops: false })
    this.basePath = path.join(appConfig.storage.graphPath, projectId)
  }

  /**
   * Initialize graph storage
   */
  async init() {
    await fs.mkdir(this.basePath, { recursive: true })
    await this.load()
  }

  /**
   * Add a page node
   */
  addPage(page: PageNode) {
    if (!this.graph.hasNode(page.id)) {
      this.graph.addNode(page.id, page)
    } else {
      // Update existing node attributes
      this.graph.replaceNodeAttributes(page.id, page)
    }
    return page.id
  }

  /**
   * Add an element node
   */
  addElement(element: ElementNode) {
    if (!this.graph.hasNode(element.id)) {
      this.graph.addNode(element.id, element)
    }
    return element.id
  }

  /**
   * Add relationship between nodes
   */
  addEdge(fromId: string, toId: string, type: EdgeType, attributes?: any) {
    if (!this.graph.hasNode(fromId) || !this.graph.hasNode(toId)) {
      throw new Error('Both nodes must exist before adding edge')
    }

    try {
      this.graph.addEdge(fromId, toId, {
        type,
        ...attributes,
      })
    } catch {
      // Edge might already exist
    }
  }

  /**
   * Build graph from crawled page data
   */
  buildFromPageData(pageData: {
    url: string
    title: string
    links: Array<{ href: string; text: string }>
    forms: Array<{ action: string; method: string }>
    buttons: Array<{ text: string; type: string }>
  }) {
    // Add page node
    const pageId = `page:${pageData.url}`
    this.addPage({
      id: pageId,
      type: NodeType.PAGE,
      url: pageData.url,
      title: pageData.title,
      requiresAuth: false,
      httpStatus: 200,
      lastCrawled: new Date(),
    })

    // Add links and relationships
    pageData.links.forEach((link, idx) => {
      const linkId = `link:${pageData.url}:${idx}`
      this.addElement({
        id: linkId,
        type: NodeType.ELEMENT,
        elementType: 'link',
        text: link.text,
        action: link.href,
      })

      // Page contains link
      this.addEdge(pageId, linkId, EdgeType.CONTAINS)

      // Link navigates to target page (only if target exists in graph)
      const targetPageId = `page:${link.href}`
      if (this.isInternalLink(link.href, pageData.url)) {
        // Check if target page node exists before adding edge
        if (this.graph.hasNode(targetPageId)) {
          this.addEdge(linkId, targetPageId, EdgeType.NAVIGATES_TO)
        }
        // Note: Edge will be added later when target page is crawled
      }
    })

    // Add forms
    pageData.forms.forEach((form, idx) => {
      const formId = `form:${pageData.url}:${idx}`
      this.addElement({
        id: formId,
        type: NodeType.ELEMENT,
        elementType: 'form',
        text: `Form ${idx + 1}`,
        action: form.action,
      })

      this.addEdge(pageId, formId, EdgeType.CONTAINS)

      if (form.action) {
        const targetId = `page:${form.action}`
        // Only add edge if target page exists in graph
        if (this.graph.hasNode(targetId)) {
          this.addEdge(formId, targetId, EdgeType.SUBMITS_TO)
        }
      }
    })

    // Add buttons
    pageData.buttons.forEach((button, idx) => {
      const buttonId = `button:${pageData.url}:${idx}`
      this.addElement({
        id: buttonId,
        type: NodeType.ELEMENT,
        elementType: 'button',
        text: button.text,
      })

      this.addEdge(pageId, buttonId, EdgeType.CONTAINS)
    })
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): GraphNode | null {
    if (!this.graph.hasNode(nodeId)) {
      return null
    }
    return this.graph.getNodeAttributes(nodeId) as GraphNode
  }

  /**
   * Find pages by URL pattern
   */
  findPages(urlPattern: string): PageNode[] {
    const pages: PageNode[] = []

    this.graph.forEachNode((_node, attrs) => {
      if (attrs.type === NodeType.PAGE && attrs.url.includes(urlPattern)) {
        pages.push(attrs as PageNode)
      }
    })

    return pages
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string, direction: 'in' | 'out' | 'both' = 'both') {
    if (!this.graph.hasNode(nodeId)) {
      return []
    }

    const neighbors =
      direction === 'in'
        ? this.graph.inNeighbors(nodeId)
        : direction === 'out'
        ? this.graph.outNeighbors(nodeId)
        : this.graph.neighbors(nodeId)

    return neighbors.map((id) => ({
      id,
      ...this.graph.getNodeAttributes(id),
    }))
  }

  /**
   * Get all edges of a specific type
   */
  getEdgesByType(type: EdgeType) {
    return this.graph
      .filterEdges((_edge, attrs) => attrs.type === type)
      .map((edge) => ({
        source: this.graph.source(edge),
        target: this.graph.target(edge),
        ...this.graph.getEdgeAttributes(edge),
      }))
  }

  /**
   * Detect workflows (common user paths)
   */
  detectWorkflows(): Array<{ name: string; steps: string[] }> {
    // Simplified workflow detection
    // In production, use more sophisticated graph algorithms
    const workflows: Array<{ name: string; steps: string[] }> = []

    // Find pages with high degree centrality (hub pages)
    const pages = this.findPages('')
    for (const page of pages) {
      const outgoingLinks = this.graph.outDegree(page.id)
      if (outgoingLinks > 3) {
        workflows.push({
          name: `Workflow from ${page.title}`,
          steps: [page.id],
        })
      }
    }

    return workflows
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
      pages: this.graph.filterNodes((_, attrs) => attrs.type === NodeType.PAGE)
        .length,
      elements: this.graph.filterNodes(
        (_, attrs) => attrs.type === NodeType.ELEMENT
      ).length,
    }
  }

  /**
   * Export graph for visualization
   */
  export() {
    return {
      nodes: this.graph.nodes().map((id) => ({
        id,
        ...this.graph.getNodeAttributes(id),
      })),
      edges: this.graph.edges().map((edge) => ({
        id: edge,
        source: this.graph.source(edge),
        target: this.graph.target(edge),
        ...this.graph.getEdgeAttributes(edge),
      })),
    }
  }

  /**
   * Save graph to disk
   */
  async save() {
    const data = this.export()
    const filePath = path.join(this.basePath, 'graph.json')
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
  }

  /**
   * Load graph from disk
   */
  async load() {
    try {
      const filePath = path.join(this.basePath, 'graph.json')
      const data = await fs.readFile(filePath, 'utf-8')
      const { nodes, edges } = JSON.parse(data)

      this.graph.clear()

      // Add nodes
      nodes.forEach((node: any) => {
        this.graph.addNode(node.id, node)
      })

      // Add edges
      edges.forEach((edge: any) => {
        this.graph.addEdge(edge.source, edge.target, edge)
      })
    } catch {
      // Graph doesn't exist yet
    }
  }

  private isInternalLink(href: string, baseUrl: string): boolean {
    try {
      const hrefUrl = new URL(href, baseUrl)
      const baseUrlObj = new URL(baseUrl)
      return hrefUrl.origin === baseUrlObj.origin
    } catch {
      return false
    }
  }
}

// Graph manager for multiple projects
class GraphManager {
  private graphs = new Map<string, KnowledgeGraph>()

  async getGraph(projectId: string): Promise<KnowledgeGraph> {
    if (!this.graphs.has(projectId)) {
      const graph = new KnowledgeGraph(projectId)
      await graph.init()
      this.graphs.set(projectId, graph)
    }
    return this.graphs.get(projectId)!
  }

  async saveAll() {
    await Promise.all(
      Array.from(this.graphs.values()).map((graph) => graph.save())
    )
  }
}

export const graphManager = new GraphManager()
