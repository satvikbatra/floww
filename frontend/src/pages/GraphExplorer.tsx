import React, { useEffect, useState, useRef } from 'react'
import { Network, DataSet } from 'vis-network/standalone'
import { getVisualizationData, getGraphStats } from '../hooks/useApi'
import type { GraphStats } from '../types'

interface GraphExplorerProps {
  projectId?: string
}

const GraphExplorer: React.FC<GraphExplorerProps> = ({ projectId: propProjectId }) => {
  const [projectId, setProjectId] = useState(propProjectId || '')
  const [graphData, setGraphData] = useState<any>(null)
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [nodeType, setNodeType] = useState('')
  const networkRef = useRef<HTMLDivElement>(null)
  const networkInstance = useRef<Network | null>(null)

  // Auto-load when projectId prop changes
  useEffect(() => {
    if (propProjectId) {
      setProjectId(propProjectId)
      loadGraph()
    }
  }, [propProjectId])

  const loadGraph = async () => {
    const idToLoad = propProjectId || projectId
    if (!idToLoad) return
    
    setLoading(true)
    try {
      const [vizResponse, statsResponse] = await Promise.all([
        getVisualizationData(idToLoad),
        getGraphStats(idToLoad)
      ])
      
      // Backend returns { nodes: [...], edges: [...] } directly
      setGraphData(vizResponse.data)
      setStats(statsResponse.data)
    } catch (error) {
      console.error('Failed to load graph:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!graphData || !networkRef.current) return

    const nodes = new DataSet(graphData.nodes.map((n: any) => ({
      id: n.id,
      label: n.title || n.text || n.id.split(':')[1] || n.id,
      color: getNodeColor(n.type),
      shape: getNodeShape(n.type),
      title: `${n.type}: ${n.url || n.text || n.id}`
    })))

    const edges = new DataSet(graphData.edges.map((e: any, idx: number) => ({
      id: e.id || `edge-${idx}`,
      from: e.source,
      to: e.target,
      label: e.type,
      arrows: 'to',
      color: { color: '#64748b' }
    })))

    const options = {
      nodes: {
        font: { color: '#f8fafc' },
        borderWidth: 2
      },
      edges: {
        font: { color: '#94a3b8', size: 12 },
        smooth: { type: 'continuous' }
      },
      physics: {
        stabilization: false,
        barnesHut: {
          gravitationalConstant: -2000,
          springConstant: 0.04,
          springLength: 95
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200
      }
    }

    networkInstance.current = new Network(networkRef.current, { nodes: nodes as any, edges: edges as any }, options as any)

    return () => {
      networkInstance.current?.destroy()
    }
  }, [graphData])

  const getNodeColor = (type: string) => {
    const colors: Record<string, string> = {
      page: '#3b82f6',
      form: '#22c55e',
      button: '#f59e0b',
      input: '#8b5cf6',
      link: '#06b6d4',
      navigation: '#ec4899',
      table: '#14b8a6'
    }
    return colors[type] || '#64748b'
  }

  const getNodeShape = (type: string) => {
    const shapes: Record<string, string> = {
      page: 'box',
      form: 'hexagon',
      button: 'ellipse',
      input: 'diamond',
      link: 'dot',
      navigation: 'star',
      table: 'square'
    }
    return shapes[type] || 'dot'
  }

  if (!propProjectId) {
    return (
      <div>
        <div className="page-header">
          <h2>Graph Explorer</h2>
          <p>Visualize and explore your application's knowledge graph</p>
        </div>

        <div className="card p-8 text-center">
          <div className="form-group max-w-md mx-auto">
            <label className="form-label">Enter Project ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="Project ID"
              className="form-input"
            />
          </div>
          <button 
            onClick={loadGraph}
            className="btn btn-primary mt-4"
            disabled={loading || !projectId}
          >
            {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : 'Load Graph'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h2>Knowledge Graph</h2>
            <p>Interactive visualization of your application structure</p>
          </div>
          {stats && (
            <div className="flex gap-4">
              <div className="stat-card">
                <div className="stat-value">{stats.nodes}</div>
                <div className="stat-label">Nodes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.edges}</div>
                <div className="stat-label">Edges</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.pages}</div>
                <div className="stat-label">Pages</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.elements}</div>
                <div className="stat-label">Elements</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '250px 1fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 className="card-title mb-4">Filters</h3>
          
          <div className="form-group">
            <label className="form-label">Node Type</label>
            <select 
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value)}
              className="form-input"
            >
              <option value="">All Types</option>
              <option value="page">Pages</option>
              <option value="form">Forms</option>
              <option value="button">Buttons</option>
              <option value="input">Inputs</option>
              <option value="link">Links</option>
              <option value="navigation">Navigation</option>
            </select>
          </div>

          <div className="mt-6">
            <h4 className="text-sm text-muted mb-2">Summary</h4>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Total Nodes</span>
              <span className="font-semibold">{stats?.nodes || 0}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted">Total Edges</span>
              <span className="font-semibold">{stats?.edges || 0}</span>
            </div>
          </div>
        </div>

        <div className="graph-container" ref={networkRef}>
          {!graphData && !loading && (
            <div className="flex items-center justify-center h-full text-muted">
              <div className="text-center">
                <p>Click "Load Graph" to visualize</p>
                <button onClick={loadGraph} className="btn btn-primary mt-4">
                  Load Graph
                </button>
              </div>
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="spinner" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GraphExplorer
