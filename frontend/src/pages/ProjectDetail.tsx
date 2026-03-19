import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Pause, RotateCcw, FileText, BarChart3 } from 'lucide-react'
import { getProject, getCrawlSessions, startCrawl } from '../hooks/useApi'
import { InteractiveCrawlBanner } from '../components/InteractiveCrawlBanner'
import GraphExplorer from './GraphExplorer'
import type { Project, CrawlSession } from '../types'

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<CrawlSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'sessions'>('overview')
  const [activeCrawlSessionId, setActiveCrawlSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (id) loadData()
  }, [id])

  const loadData = async () => {
    if (!id) return
    
    try {
      const [projectRes, sessionsRes] = await Promise.all([
        getProject(id),
        getCrawlSessions(id)
      ])
      setProject(projectRes.data)
      setSessions(sessionsRes.data.sessions || [])
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
      setActiveCrawlSessionId(response.data?.session_id || null)
      loadData()
    } catch (error) {
      console.error('Failed to start crawl:', error)
    }
  }

  const handleContinueCrawl = async () => {
    if (!activeCrawlSessionId) return
    
    try {
      await fetch(`http://localhost:8080/api/v1/crawl/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeCrawlSessionId,
          action: 'continue'
        })
      })
      console.log('Continue action sent')
    } catch (error) {
      console.error('Failed to send continue action:', error)
    }
  }

  const handleSkipPage = async () => {
    if (!activeCrawlSessionId) return
    
    try {
      await fetch(`http://localhost:8080/api/v1/crawl/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeCrawlSessionId,
          action: 'skip'
        })
      })
      console.log('Skip action sent')
    } catch (error) {
      console.error('Failed to send skip action:', error)
    }
  }

  const handleStopCrawl = async () => {
    if (!activeCrawlSessionId) return
    
    try {
      await fetch(`http://localhost:8080/api/v1/crawl/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeCrawlSessionId,
          action: 'cancel'
        })
      })
      setActiveCrawlSessionId(null)
      console.log('Stop action sent')
    } catch (error) {
      console.error('Failed to send stop action:', error)
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

  return (
    <div>
      {/* Interactive Crawl Banner - shows when waiting for user input */}
      {activeCrawlSessionId && (
        <InteractiveCrawlBanner
          sessionId={activeCrawlSessionId}
          onContinue={handleContinueCrawl}
          onSkip={handleSkipPage}
          onStop={handleStopCrawl}
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
            <button onClick={handleStartCrawl} className="btn btn-primary">
              <Play size={18} />
              Start Crawl
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <FileText size={18} />
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('graph')}
          className={`btn ${activeTab === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <BarChart3 size={18} />
          Knowledge Graph
        </button>
        <button 
          onClick={() => setActiveTab('sessions')}
          className={`btn ${activeTab === 'sessions' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <RotateCcw size={18} />
          Crawl Sessions ({sessions.length})
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-3">
          <div className="stat-card">
            <div className="stat-value">{sessions.length}</div>
            <div className="stat-label">Crawl Sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{sessions[sessions.length - 1]?.pages_visited || 0}</div>
            <div className="stat-label">Pages Discovered</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {sessions.find(s => s.status === 'running') ? 'Running' : 'Idle'}
            </div>
            <div className="stat-label">Status</div>
          </div>
        </div>
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
