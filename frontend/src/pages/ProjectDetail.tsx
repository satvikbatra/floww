import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Play, FileText, BarChart3, RotateCcw, BookOpen } from 'lucide-react'
import { getProject, getCrawlSessions, startCrawl, sendCrawlAction } from '../hooks/useApi'
import { InteractiveCrawlBanner } from '../components/InteractiveCrawlBanner'
import { DocumentsPanel } from '../components/DocumentsPanel'
import GraphExplorer from './GraphExplorer'
import type { Project, CrawlSession } from '../types'

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<CrawlSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'sessions' | 'documents'>('overview')
  const [activeCrawlSessionId, setActiveCrawlSessionId] = useState<string | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<{
    pagesVisited: number
    pagesTotal: number
    currentUrl: string
    status: string
  } | null>(null)

  useEffect(() => {
    if (id) loadData()
  }, [id])

  // WebSocket for real-time crawl progress
  useEffect(() => {
    if (!activeCrawlSessionId) {
      setCrawlProgress(null)
      return
    }

    const wsUrl = `ws://localhost:8000/api/v1/ws/crawl/${activeCrawlSessionId}`
    let ws: WebSocket | null = null

    try {
      ws = new WebSocket(wsUrl)

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'crawl:progress') {
          setCrawlProgress(data.data)
        }
        if (data.type === 'crawl:completed' || data.type === 'crawl:failed') {
          setCrawlProgress(null)
          setActiveCrawlSessionId(null)
          loadData()
        }
      }

      ws.onerror = () => {
        // WS not available, fall back to polling
      }
    } catch {
      // WS connection failed, not critical
    }

    return () => {
      ws?.close()
    }
  }, [activeCrawlSessionId])

  const loadData = async () => {
    if (!id) return

    try {
      const [projectRes, sessionsRes] = await Promise.all([
        getProject(id),
        getCrawlSessions(id)
      ])
      setProject(projectRes.data)
      const sessionsList = sessionsRes.data.sessions || []
      setSessions(sessionsList)

      // Check if there's an active crawl
      const running = sessionsList.find((s: CrawlSession) => s.status === 'RUNNING')
      if (running) {
        setActiveCrawlSessionId(running.id)
      }
    } catch (error) {
      console.error('Failed to load project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartCrawl = async () => {
    if (!id) return

    try {
      const response = await startCrawl(id)
      const sessionId = response.data?.id || response.data?.session_id
      setActiveCrawlSessionId(sessionId || null)
      loadData()
    } catch (error) {
      console.error('Failed to start crawl:', error)
    }
  }

  const handleCrawlAction = async (action: string) => {
    if (!activeCrawlSessionId || !id) return

    try {
      await sendCrawlAction(id, activeCrawlSessionId, action)
      if (action === 'cancel') {
        setActiveCrawlSessionId(null)
        setCrawlProgress(null)
      }
    } catch (error) {
      console.error(`Failed to send ${action} action:`, error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    )
  }

  if (!project) {
    return <div className="card p-8 text-center">Project not found</div>
  }

  const latestSession = sessions[0]
  const totalPages = sessions.reduce((sum, s) => sum + (s.pages_visited || 0), 0)

  return (
    <div>
      {/* Interactive Crawl Banner */}
      {activeCrawlSessionId && (
        <InteractiveCrawlBanner
          sessionId={activeCrawlSessionId}
          onContinue={() => handleCrawlAction('continue')}
          onSkip={() => handleCrawlAction('skip')}
          onStop={() => handleCrawlAction('cancel')}
        />
      )}

      <div className="page-header">
        <div className="flex justify-between items-start">
          <div>
            <h2>{project.name}</h2>
            <p className="flex items-center gap-2">
              <code>{project.base_url}</code>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleStartCrawl}
              className="btn btn-primary"
              disabled={!!activeCrawlSessionId}
            >
              <Play size={18} />
              {activeCrawlSessionId ? 'Crawling...' : 'Start Crawl'}
            </button>
          </div>
        </div>
      </div>

      {/* Crawl Progress Bar */}
      {crawlProgress && (
        <div className="card mb-4" style={{ padding: '12px 16px' }}>
          <div className="flex justify-between items-center mb-2">
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              Crawling: {crawlProgress.pagesVisited} / {crawlProgress.pagesTotal} pages
            </span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              {crawlProgress.currentUrl}
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--color-bg-secondary)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(100, (crawlProgress.pagesVisited / crawlProgress.pagesTotal) * 100)}%`,
              height: '100%',
              background: 'var(--color-primary)',
              borderRadius: '3px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        {(['overview', 'documents', 'graph', 'sessions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
          >
            {tab === 'overview' && <FileText size={18} />}
            {tab === 'documents' && <BookOpen size={18} />}
            {tab === 'graph' && <BarChart3 size={18} />}
            {tab === 'sessions' && <RotateCcw size={18} />}
            {tab === 'overview' && 'Overview'}
            {tab === 'documents' && 'Documents'}
            {tab === 'graph' && 'Knowledge Graph'}
            {tab === 'sessions' && `Crawl Sessions (${sessions.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-3">
          <div className="stat-card">
            <div className="stat-value">{sessions.length}</div>
            <div className="stat-label">Crawl Sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalPages}</div>
            <div className="stat-label">Pages Discovered</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {activeCrawlSessionId ? 'Running' : latestSession?.status || 'Idle'}
            </div>
            <div className="stat-label">Status</div>
          </div>
        </div>
      )}

      {activeTab === 'documents' && id && (
        <DocumentsPanel
          projectId={id}
          sessions={sessions}
        />
      )}

      {activeTab === 'graph' && id && (
        <GraphExplorer projectId={id} />
      )}

      {activeTab === 'sessions' && (
        <div className="card">
          <h3 className="card-title mb-4">Crawl History</h3>
          {sessions.length === 0 ? (
            <p className="text-muted">No crawl sessions yet. Start your first crawl.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Pages</th>
                    <th>Errors</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr key={session.id}>
                      <td>
                        <span className={`badge badge-${session.status}`}>
                          {session.status}
                        </span>
                      </td>
                      <td>{session.pages_visited} / {session.pages_total}</td>
                      <td>{session.errors_count}</td>
                      <td>{session.started_at ? new Date(session.started_at).toLocaleString() : '-'}</td>
                      <td>{session.completed_at ? new Date(session.completed_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProjectDetail
