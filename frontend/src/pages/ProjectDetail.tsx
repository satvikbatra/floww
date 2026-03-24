import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Play, FileText, BarChart3, RotateCcw, BookOpen } from 'lucide-react'
import { motion } from 'framer-motion'
import { getProject, getCrawlSessions, startCrawl, sendCrawlAction } from '../hooks/useApi'
import { InteractiveCrawlBanner } from '../components/InteractiveCrawlBanner'
import { DocumentsPanel } from '../components/DocumentsPanel'
import GraphExplorer from './GraphExplorer'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table'
import type { Project, CrawlSession } from '../types'
import styles from './ProjectDetail.module.css'

const statusVariantMap: Record<string, 'primary' | 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  RUNNING: 'primary',
  COMPLETED: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
  PENDING: 'info',
}

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<CrawlSession[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('overview')
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

    const wsUrl = `ws://localhost:8100/api/v1/ws/crawl/${activeCrawlSessionId}`
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
      <div className={styles.skeletonPage}>
        <div className={styles.skeletonHeader}>
          <div className={styles.skeletonHeaderLeft}>
            <Skeleton variant="rectangular" width={280} height={32} />
            <Skeleton variant="rectangular" width={200} height={24} />
          </div>
          <Skeleton variant="rectangular" width={120} height={40} />
        </div>
        <div className={styles.skeletonTabs}>
          <Skeleton variant="rectangular" width={100} height={36} />
          <Skeleton variant="rectangular" width={100} height={36} />
          <Skeleton variant="rectangular" width={100} height={36} />
          <Skeleton variant="rectangular" width={100} height={36} />
        </div>
        <div className={styles.skeletonCards}>
          <Skeleton variant="rectangular" height={120} />
          <Skeleton variant="rectangular" height={120} />
          <Skeleton variant="rectangular" height={120} />
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <Card>
        <EmptyState
          title="Project not found"
          description="The project you are looking for does not exist or has been removed."
        />
      </Card>
    )
  }

  const latestSession = sessions[0]
  const totalPages = sessions.reduce((sum, s) => sum + (s.pages_visited || 0), 0)
  const documentsCount = undefined // Documents count is managed inside DocumentsPanel

  const progressPercent = crawlProgress
    ? Math.min(100, (crawlProgress.pagesVisited / crawlProgress.pagesTotal) * 100)
    : 0

  const tabDefinitions = [
    { id: 'overview', label: 'Overview', icon: <FileText size={16} /> },
    { id: 'documents', label: 'Documents', icon: <BookOpen size={16} />, count: documentsCount },
    { id: 'graph', label: 'Knowledge Graph', icon: <BarChart3 size={16} /> },
    { id: 'sessions', label: 'Sessions', icon: <RotateCcw size={16} />, count: sessions.length },
  ]

  return (
    <div className={styles.page}>
      {/* Interactive Crawl Banner */}
      {activeCrawlSessionId && (
        <InteractiveCrawlBanner
          sessionId={activeCrawlSessionId}
          onContinue={() => handleCrawlAction('continue')}
          onSkip={() => handleCrawlAction('skip')}
          onStop={() => handleCrawlAction('cancel')}
        />
      )}

      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>{project.name}</h1>
          <Badge variant="default" className={styles.baseUrl}>{project.base_url}</Badge>
        </div>
        <div className={styles.headerActions}>
          <Button
            icon={<Play size={18} />}
            onClick={handleStartCrawl}
            disabled={!!activeCrawlSessionId}
          >
            {activeCrawlSessionId ? 'Crawling...' : 'Start Crawl'}
          </Button>
        </div>
      </motion.div>

      {/* Crawl Progress */}
      {crawlProgress && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card padding="sm" className={styles.progressCard}>
            <div className={styles.progressHeader}>
              <span className={styles.progressLabel}>
                Crawling: {crawlProgress.pagesVisited} / {crawlProgress.pagesTotal} pages
              </span>
              <span className={styles.progressUrl}>
                {crawlProgress.currentUrl}
              </span>
            </div>
            <ProgressBar value={progressPercent} size="sm" />
          </Card>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={tabDefinitions}
        activeTab={activeTab}
        onChange={setActiveTab}
        className={styles.tabs}
      />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <motion.div
          className={styles.statsGrid}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className={styles.statCard}>
            <div className={styles.statValue}>{sessions.length}</div>
            <div className={styles.statLabel}>Crawl Sessions</div>
          </Card>
          <Card className={styles.statCard}>
            <div className={styles.statValue}>{totalPages}</div>
            <div className={styles.statLabel}>Pages Discovered</div>
          </Card>
          <Card className={styles.statCard}>
            <div className={styles.statValue}>
              {activeCrawlSessionId ? 'Running' : latestSession?.status || 'Idle'}
            </div>
            <div className={styles.statLabel}>Status</div>
          </Card>
        </motion.div>
      )}

      {activeTab === 'documents' && id && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DocumentsPanel
            projectId={id}
            sessions={sessions}
          />
        </motion.div>
      )}

      {activeTab === 'graph' && id && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <GraphExplorer projectId={id} />
        </motion.div>
      )}

      {activeTab === 'sessions' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className={styles.sessionsCard}>
            <h3 className={styles.sessionsTitle}>Crawl History</h3>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<RotateCcw size={40} />}
                title="No crawl sessions yet"
                description="Start your first crawl to see session history here."
                action={
                  <Button
                    icon={<Play size={16} />}
                    onClick={handleStartCrawl}
                    disabled={!!activeCrawlSessionId}
                  >
                    Start Crawl
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Pages</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Badge
                          variant={statusVariantMap[session.status.toUpperCase()] || 'default'}
                          dot
                        >
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={styles.pagesCell}>
                        {session.pages_visited} / {session.pages_total}
                      </TableCell>
                      <TableCell>{session.errors_count}</TableCell>
                      <TableCell className={styles.dateCell}>
                        {session.started_at ? new Date(session.started_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className={styles.dateCell}>
                        {session.completed_at ? new Date(session.completed_at).toLocaleString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  )
}

export default ProjectDetail
