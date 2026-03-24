import React, { useEffect, useState } from 'react'
import { FileText, Download, Trash2, Sparkles } from 'lucide-react'
import {
  generateDocument,
  getDocuments,
  downloadDocument,
  deleteDocument,
  startAnalysis,
  getAnalysisStatus,
} from '../hooks/useApi'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Badge } from './ui/Badge'
import { Skeleton } from './ui/Skeleton'
import { EmptyState } from './ui/EmptyState'
import type { CrawlSession } from '../types'
import styles from './DocumentsPanel.module.css'

interface Document {
  id: string
  projectId: string
  title: string
  description?: string
  format: 'MARKDOWN' | 'HTML' | 'PDF' | 'JSON'
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED'
  outputPath?: string
  size: number
  generatedAt?: string
  error?: string
  createdAt: string
}

interface DocumentsPanelProps {
  projectId: string
  sessions: CrawlSession[]
}

export const DocumentsPanel: React.FC<DocumentsPanelProps> = ({ projectId, sessions }) => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    format: 'MARKDOWN' as 'MARKDOWN' | 'HTML',
    crawlSessionId: '',
    includeScreenshots: true,
    includeAiAnalysis: true,
    language: 'en',
  })

  useEffect(() => {
    loadDocuments()
  }, [projectId])

  // Poll for generating documents
  useEffect(() => {
    const hasGenerating = documents.some(d => d.status === 'GENERATING' || d.status === 'PENDING')
    if (!hasGenerating) return

    const interval = setInterval(loadDocuments, 3000)
    return () => clearInterval(interval)
  }, [documents])

  const loadDocuments = async () => {
    try {
      const res = await getDocuments(projectId)
      setDocuments(res.data.documents || [])
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalysisStatus('Starting analysis...')
    try {
      const latestSession = sessions.find(s => s.status.toUpperCase() === 'COMPLETED')
      await startAnalysis(projectId, latestSession?.id)

      // Poll for analysis status
      const pollInterval = setInterval(async () => {
        try {
          const res = await getAnalysisStatus(projectId)
          const data = res.data
          setAnalysisStatus(`Analyzed ${data.analyzed || 0} / ${data.total || 0} pages`)
          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(pollInterval)
            setAnalyzing(false)
            setAnalysisStatus(data.status === 'completed' ? 'Analysis complete' : 'Analysis failed')
          }
        } catch {
          clearInterval(pollInterval)
          setAnalyzing(false)
          setAnalysisStatus(null)
        }
      }, 2000)
    } catch (error) {
      console.error('Failed to start analysis:', error)
      setAnalyzing(false)
      setAnalysisStatus('Failed to start analysis')
    }
  }

  const handleGenerate = async () => {
    if (!formData.title.trim()) return

    setGenerating(true)
    try {
      await generateDocument(projectId, {
        title: formData.title,
        format: formData.format,
        crawlSessionId: formData.crawlSessionId || undefined,
        includeScreenshots: formData.includeScreenshots,
        includeAiAnalysis: formData.includeAiAnalysis,
        language: formData.language,
      })
      setShowForm(false)
      setFormData({ ...formData, title: '' })
      loadDocuments()
    } catch (error) {
      console.error('Failed to generate document:', error)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (doc: Document) => {
    try {
      const res = await downloadDocument(projectId, doc.id)
      const blob = new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.title}.${doc.format === 'HTML' ? 'html' : 'md'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download:', error)
    }
  }

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(projectId, docId)
      loadDocuments()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const completedSessions = sessions.filter(s => s.status.toUpperCase() === 'COMPLETED')
  const hasData = completedSessions.length > 0

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const statusDotClass = (status: string) => {
    switch (status) {
      case 'PENDING': return styles.statusPending
      case 'GENERATING': return styles.statusGenerating
      case 'COMPLETED': return styles.statusCompleted
      case 'FAILED': return styles.statusFailed
      default: return ''
    }
  }

  const formatOptions = [
    { value: 'MARKDOWN', label: 'Markdown' },
    { value: 'HTML', label: 'HTML (self-contained)' },
  ]

  const sessionOptions = [
    { value: '', label: 'Latest session' },
    ...completedSessions.map(s => ({
      value: s.id,
      label: `${new Date(s.started_at || s.created_at).toLocaleString()} (${s.pages_visited} pages)`,
    })),
  ]

  if (loading) {
    return (
      <div className={styles.skeletonList}>
        <Skeleton variant="rectangular" height={56} />
        <Skeleton variant="rectangular" height={64} />
        <Skeleton variant="rectangular" height={64} />
        <Skeleton variant="rectangular" height={64} />
      </div>
    )
  }

  return (
    <div>
      {/* Actions Bar */}
      <Card padding="sm" className={styles.actionsBar}>
        {hasData && (
          <>
            <Button
              variant="secondary"
              icon={<Sparkles size={16} />}
              onClick={handleAnalyze}
              loading={analyzing}
            >
              {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
            </Button>

            <Button
              icon={<FileText size={16} />}
              onClick={() => setShowForm(!showForm)}
            >
              Generate Documentation
            </Button>
          </>
        )}

        {analysisStatus && (
          <span className={styles.analysisStatus}>{analysisStatus}</span>
        )}

        {!hasData && (
          <p className={styles.noDataText}>
            Complete a crawl first to generate documentation.
          </p>
        )}
      </Card>

      {/* Generation Form */}
      {showForm && (
        <Card className={styles.formCard}>
          <h3 className={styles.formTitle}>Generate Documentation</h3>

          <div className={styles.formGrid}>
            <Input
              label="Document Title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. User Manual"
            />

            <Select
              label="Format"
              value={formData.format}
              onChange={e => setFormData({ ...formData, format: e.target.value as 'MARKDOWN' | 'HTML' })}
              options={formatOptions}
            />

            {completedSessions.length > 1 && (
              <Select
                label="Crawl Session"
                value={formData.crawlSessionId}
                onChange={e => setFormData({ ...formData, crawlSessionId: e.target.value })}
                options={sessionOptions}
              />
            )}

            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.includeScreenshots}
                  onChange={e => setFormData({ ...formData, includeScreenshots: e.target.checked })}
                />
                Include screenshots
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.includeAiAnalysis}
                  onChange={e => setFormData({ ...formData, includeAiAnalysis: e.target.checked })}
                />
                Include AI analysis
              </label>
            </div>

            <div className={styles.formActions}>
              <Button
                icon={<FileText size={16} />}
                onClick={handleGenerate}
                loading={generating}
                disabled={!formData.title.trim()}
              >
                {generating ? 'Generating...' : 'Generate'}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Documents List */}
      {documents.length > 0 ? (
        <Card>
          <h3 className={styles.listTitle}>Generated Documents</h3>
          <div className={styles.documentsList}>
            {documents.map(doc => (
              <Card key={doc.id} variant="interactive" padding="sm" className={styles.documentCard}>
                <FileText size={20} className={styles.docIcon} />

                <div className={styles.docInfo}>
                  <span className={styles.docTitle}>{doc.title}</span>
                  <Badge variant="default">{doc.format}</Badge>
                </div>

                <div className={styles.docMeta}>
                  <span className={styles.statusIndicator}>
                    <span className={`${styles.statusDot} ${statusDotClass(doc.status)}`} />
                    {doc.status}
                  </span>
                  {doc.size > 0 && <span>{formatSize(doc.size)}</span>}
                  {doc.generatedAt && (
                    <span>{new Date(doc.generatedAt).toLocaleString()}</span>
                  )}
                </div>

                <div className={styles.docActions}>
                  {doc.status === 'COMPLETED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={() => handleDownload(doc)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => handleDelete(doc.id)}
                  />
                </div>
              </Card>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<FileText size={48} />}
            title="No documents yet"
            description={
              hasData
                ? 'Click "Generate Documentation" to create your first document.'
                : 'Complete a crawl session first, then generate documentation.'
            }
            action={
              hasData ? (
                <Button
                  icon={<FileText size={16} />}
                  onClick={() => setShowForm(true)}
                >
                  Generate Documentation
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  )
}
