import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { AnimatePresence, motion } from 'framer-motion'
import { getVisualizationData, getGraphStats } from '../hooks/useApi'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import type { GraphStats } from '../types'
import styles from './GraphExplorer.module.css'

interface GraphExplorerProps {
  projectId?: string
}

const NODE_COLORS: Record<string, string> = {
  page: '#3b82f6',
  form: '#22c55e',
  button: '#f59e0b',
  input: '#a855f7',
  link: '#06b6d4',
  navigation: '#ec4899',
  table: '#14b8a6',
}

const LEGEND_ITEMS = [
  { type: 'page', color: '#3b82f6', label: 'Page' },
  { type: 'form', color: '#22c55e', label: 'Form' },
  { type: 'button', color: '#f59e0b', label: 'Button' },
  { type: 'input', color: '#a855f7', label: 'Input' },
  { type: 'link', color: '#06b6d4', label: 'Link' },
  { type: 'navigation', color: '#ec4899', label: 'Navigation' },
  { type: 'table', color: '#14b8a6', label: 'Table' },
]

const NODE_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'page', label: 'Pages' },
  { value: 'form', label: 'Forms' },
  { value: 'button', label: 'Buttons' },
  { value: 'input', label: 'Inputs' },
  { value: 'link', label: 'Links' },
  { value: 'navigation', label: 'Navigation' },
]

const transformData = (apiData: any) => {
  return {
    nodes: apiData.nodes.map((n: any) => ({
      id: n.id,
      label: n.title || n.text || n.id.split(':')[1] || n.id,
      type: n.type,
      url: n.url,
      properties: n.properties,
      val: n.type === 'page' ? 8 : 3,
    })),
    links: apiData.edges.map((e: any) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    })),
  }
}

const GraphExplorer: React.FC<GraphExplorerProps> = ({ projectId: propProjectId }) => {
  const [projectId, setProjectId] = useState(propProjectId || '')
  const [graphData, setGraphData] = useState<any>(null)
  const [_stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const [connectedNodes, setConnectedNodes] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [nodeTypeFilter, setNodeTypeFilter] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Auto-load when projectId prop is provided
  useEffect(() => {
    if (propProjectId) {
      setProjectId(propProjectId)
    }
  }, [propProjectId])

  useEffect(() => {
    if (propProjectId) {
      loadGraph()
    }
  }, [propProjectId])

  // Track container dimensions
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const loadGraph = async () => {
    const idToLoad = propProjectId || projectId
    if (!idToLoad) return

    setLoading(true)
    try {
      const [vizResponse, statsResponse] = await Promise.all([
        getVisualizationData(idToLoad),
        getGraphStats(idToLoad),
      ])

      setGraphData(transformData(vizResponse.data))
      setStats(statsResponse.data)
    } catch (error) {
      console.error('Failed to load graph:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] }
    let nodes = graphData.nodes
    if (nodeTypeFilter) {
      nodes = nodes.filter((n: any) => n.type === nodeTypeFilter)
    }
    if (searchTerm) {
      nodes = nodes.filter((n: any) =>
        n.label?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }
    const nodeIds = new Set(nodes.map((n: any) => n.id))
    const links = graphData.links.filter((l: any) => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source
      const targetId = typeof l.target === 'object' ? l.target.id : l.target
      return nodeIds.has(sourceId) && nodeIds.has(targetId)
    })
    return { nodes, links }
  }, [graphData, nodeTypeFilter, searchTerm])

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node)
  }, [])

  const handleNodeHover = useCallback(
    (node: any) => {
      setHoveredNode(node || null)
      if (node && graphData) {
        const connected = new Set<string>()
        connected.add(node.id)
        graphData.links.forEach((link: any) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source
          const targetId = typeof link.target === 'object' ? link.target.id : link.target
          if (sourceId === node.id) connected.add(targetId)
          if (targetId === node.id) connected.add(sourceId)
        })
        setConnectedNodes(connected)
      } else {
        setConnectedNodes(new Set())
      }
    },
    [graphData],
  )

  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const { x, y, label, type, id } = node
      const size = type === 'page' ? 6 : 4
      const color = NODE_COLORS[type] || '#71717a'
      const isSelected = selectedNode?.id === id
      const isHovered = hoveredNode?.id === id
      const isConnected = hoveredNode ? connectedNodes.has(id) : true
      const alpha = hoveredNode && !isConnected && !isHovered ? 0.15 : 1

      ctx.globalAlpha = alpha

      // Glow for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath()
        ctx.arc(x, y, size + 3, 0, 2 * Math.PI)
        ctx.fillStyle = `${color}33`
        ctx.fill()
      }

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, size, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Label (only show when zoomed in enough)
      if (globalScale > 1.5 || isSelected || isHovered) {
        const fontSize = Math.max(10 / globalScale, 3)
        ctx.font = `500 ${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isSelected || isHovered ? '#fafafa' : '#a1a1aa'

        const text = label?.length > 20 ? label.substring(0, 20) + '...' : label
        // Text shadow for readability
        ctx.strokeStyle = '#09090b'
        ctx.lineWidth = 3 / globalScale
        ctx.strokeText(text, x, y + size + 2)
        ctx.fillText(text, x, y + size + 2)
      }

      ctx.globalAlpha = 1
    },
    [selectedNode, hoveredNode, connectedNodes],
  )

  const drawNodeArea = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const size = node.type === 'page' ? 6 : 4
      ctx.beginPath()
      ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [],
  )

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom * 1.3, 300)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom * 0.7, 300)
    }
  }, [])

  const handleZoomFit = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 40)
    }
  }, [])

  // Get connected nodes for the sidebar
  const getConnectedNodesForSelected = useMemo(() => {
    if (!selectedNode || !graphData) return []
    const connected: Array<{ node: any; relationship: string; direction: string }> = []
    graphData.links.forEach((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      if (sourceId === selectedNode.id) {
        const targetNode = graphData.nodes.find((n: any) => n.id === targetId)
        if (targetNode) {
          connected.push({ node: targetNode, relationship: link.type, direction: 'outgoing' })
        }
      }
      if (targetId === selectedNode.id) {
        const sourceNode = graphData.nodes.find((n: any) => n.id === sourceId)
        if (sourceNode) {
          connected.push({ node: sourceNode, relationship: link.type, direction: 'incoming' })
        }
      }
    })
    return connected
  }, [selectedNode, graphData])

  // Standalone mode (no projectId prop)
  if (!propProjectId) {
    return (
      <div className={styles.page}>
        <div className={styles.standaloneWrapper}>
          <Card padding="lg" className={styles.standaloneCard}>
            <div className={styles.standaloneIcon}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="2" />
                <circle cx="4" cy="7" r="2" />
                <circle cx="20" cy="7" r="2" />
                <circle cx="4" cy="17" r="2" />
                <circle cx="20" cy="17" r="2" />
                <line x1="6" y1="7" x2="10" y2="11" />
                <line x1="18" y1="7" x2="14" y2="11" />
                <line x1="6" y1="17" x2="10" y2="13" />
                <line x1="18" y1="17" x2="14" y2="13" />
              </svg>
            </div>
            <h2 className={styles.standaloneTitle}>Graph Explorer</h2>
            <p className={styles.standaloneDesc}>
              Visualize and explore your application's knowledge graph
            </p>
            <div className={styles.standaloneInput}>
              <Input
                label="Project ID"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Enter your project ID"
              />
            </div>
            <Button
              onClick={loadGraph}
              loading={loading}
              disabled={!projectId}
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="4" cy="7" r="2" />
                  <circle cx="20" cy="7" r="2" />
                  <line x1="6" y1="7" x2="10" y2="11" />
                  <line x1="18" y1="7" x2="14" y2="11" />
                </svg>
              }
            >
              Load Graph
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading && !graphData) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
        </div>
      </div>
    )
  }

  // Empty state
  if (!loading && !graphData) {
    return (
      <div className={styles.page}>
        <div className={styles.graphWrapper}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="2" />
                <circle cx="4" cy="7" r="2" />
                <circle cx="20" cy="7" r="2" />
                <circle cx="4" cy="17" r="2" />
                <circle cx="20" cy="17" r="2" />
                <line x1="6" y1="7" x2="10" y2="11" />
                <line x1="18" y1="7" x2="14" y2="11" />
                <line x1="6" y1="17" x2="10" y2="13" />
                <line x1="18" y1="17" x2="14" y2="13" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No graph data yet</h3>
            <p className={styles.emptyDesc}>Run a crawl first to generate the knowledge graph</p>
            <Button onClick={loadGraph} loading={loading}>
              Load Graph
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search nodes..."
          />
          <Select
            options={NODE_TYPE_OPTIONS}
            value={nodeTypeFilter}
            onChange={(e) => setNodeTypeFilter(e.target.value)}
          />
          <div className={styles.statsGroup}>
            <Badge variant="info">{filteredData.nodes.length} Nodes</Badge>
            <Badge variant="default">{filteredData.links.length} Edges</Badge>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Zoom in">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Zoom out">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomFit} title="Fit to view">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleFullscreen} title="Toggle fullscreen">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isFullscreen ? (
                <>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </>
              ) : (
                <>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </>
              )}
            </svg>
          </Button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className={styles.graphWrapper} ref={containerRef}>
        <div className={styles.graphContainer}>
          <ForceGraph2D
            ref={graphRef}
            graphData={filteredData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="transparent"
            nodeLabel={(node: any) => `${node.type}: ${node.label}`}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={drawNodeArea}
            linkColor={() => 'rgba(82, 82, 91, 0.4)'}
            linkWidth={1.2}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.9}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={() => 'rgba(59, 130, 246, 0.6)'}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={() => setSelectedNode(null)}
            cooldownTicks={200}
            warmupTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          {LEGEND_ITEMS.map((item) => (
            <div key={item.type} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>

        {/* Detail Sidebar */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              className={styles.sidebar}
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className={styles.sidebarHeader}>
                <h3 className={styles.sidebarTitle}>
                  <Badge
                    variant={
                      selectedNode.type === 'page'
                        ? 'primary'
                        : selectedNode.type === 'form'
                          ? 'success'
                          : selectedNode.type === 'button'
                            ? 'warning'
                            : 'default'
                    }
                    size="sm"
                  >
                    {selectedNode.type}
                  </Badge>{' '}
                  {selectedNode.label}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNode(null)}
                  title="Close"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Button>
              </div>

              <div className={styles.sidebarBody}>
                {/* URL */}
                {selectedNode.url && (
                  <div className={styles.sidebarSection}>
                    <div className={styles.sidebarLabel}>URL</div>
                    <a
                      href={selectedNode.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sidebarUrl}
                    >
                      {selectedNode.url}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                )}

                {/* Node ID */}
                <div className={styles.sidebarSection}>
                  <div className={styles.sidebarLabel}>Node ID</div>
                  <div className={styles.sidebarValue}>{selectedNode.id}</div>
                </div>

                {/* Properties */}
                {selectedNode.properties &&
                  Object.keys(selectedNode.properties).length > 0 && (
                    <div className={styles.sidebarSection}>
                      <div className={styles.sidebarLabel}>Properties</div>
                      <div className={styles.propertiesGrid}>
                        {Object.entries(selectedNode.properties).map(([key, value]) => (
                          <React.Fragment key={key}>
                            <span className={styles.propKey}>{key}</span>
                            <span className={styles.propValue}>{String(value)}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                <hr className={styles.divider} />

                {/* Connected Nodes */}
                <div className={styles.sidebarSection}>
                  <div className={styles.sidebarLabel}>
                    Connected Nodes ({getConnectedNodesForSelected.length})
                  </div>
                  <div className={styles.connectedList}>
                    {getConnectedNodesForSelected.map(({ node, relationship, direction }, idx) => (
                      <div
                        key={`${node.id}-${idx}`}
                        className={styles.connectedItem}
                        onClick={() => setSelectedNode(node)}
                      >
                        <span
                          className={styles.connectedDot}
                          style={{ backgroundColor: NODE_COLORS[node.type] || '#71717a' }}
                        />
                        <span className={styles.connectedLabel}>{node.label}</span>
                        <span className={styles.connectedType}>
                          {direction === 'outgoing' ? '\u2192' : '\u2190'} {relationship}
                        </span>
                      </div>
                    ))}
                    {getConnectedNodesForSelected.length === 0 && (
                      <div className={styles.sidebarValue}>No connected nodes</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default GraphExplorer
