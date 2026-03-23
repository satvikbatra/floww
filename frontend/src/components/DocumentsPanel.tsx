import React, { useEffect, useState } from 'react'
import { FileText, Download, Trash2, Loader, Sparkles } from 'lucide-react'
import {
  generateDocument,
  getDocuments,
  downloadDocument,
  deleteDocument,
  startAnalysis,
  getAnalysisStatus,
} from '../hooks/useApi'
import type { CrawlSession } from '../types'

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

  const statusColors: Record<string, string> = {
    PENDING: '#f59e0b',
    GENERATING: '#3b82f6',
    COMPLETED: '#10b981',
    FAILED: '#ef4444',
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>
  }

  return (
    <div>
      {/* Actions bar */}
      <div className="card mb-4" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        {hasData && (
          <>
            <button
              onClick={handleAnalyze}
              className="btn btn-secondary"
              disabled={analyzing}
            >
              {analyzing ? <Loader size={18} className="spin" /> : <Sparkles size={18} />}
              {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
            </button>

            <button
              onClick={() => setShowForm(!showForm)}
              className="btn btn-primary"
            >
              <FileText size={18} />
              Generate Documentation
            </button>
          </>
        )}

        {analysisStatus && (
          <span style={{ fontSize: '13px', opacity: 0.8, marginLeft: 'auto' }}>
            {analysisStatus}
          </span>
        )}

        {!hasData && (
          <p style={{ opacity: 0.6, margin: 0 }}>
            Complete a crawl first to generate documentation.
          </p>
        )}
      </div>

      {/* Generation Form */}
      {showForm && (
        <div className="card mb-4" style={{ padding: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Generate Documentation</h3>

          <div style={{ display: 'grid', gap: '12px', maxWidth: '500px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Document Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. User Manual"
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                  borderRadius: '6px', color: 'inherit', fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Format
              </label>
              <select
                value={formData.format}
                onChange={e => setFormData({ ...formData, format: e.target.value as 'MARKDOWN' | 'HTML' })}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                  borderRadius: '6px', color: 'inherit', fontSize: '14px'
                }}
              >
                <option value="MARKDOWN">Markdown</option>
                <option value="HTML">HTML (self-contained)</option>
              </select>
            </div>

            {completedSessions.length > 1 && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                  Crawl Session
                </label>
                <select
                  value={formData.crawlSessionId}
                  onChange={e => setFormData({ ...formData, crawlSessionId: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
                    borderRadius: '6px', color: 'inherit', fontSize: '14px'
                  }}
                >
                  <option value="">Latest session</option>
                  {completedSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.started_at || s.created_at).toLocaleString()} ({s.pages_visited} pages)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.includeScreenshots}
                  onChange={e => setFormData({ ...formData, includeScreenshots: e.target.checked })}
                />
                Include screenshots
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.includeAiAnalysis}
                  onChange={e => setFormData({ ...formData, includeAiAnalysis: e.target.checked })}
                />
                Include AI analysis
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleGenerate}
                className="btn btn-primary"
                disabled={generating || !formData.title.trim()}
              >
                {generating ? <Loader size={18} className="spin" /> : <FileText size={18} />}
                {generating ? 'Generating...' : 'Generate'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documents List */}
      {documents.length > 0 ? (
        <div className="card">
          <h3 className="card-title mb-4">Generated Documents</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Generated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 500 }}>{doc.title}</td>
                    <td>
                      <span className="badge">{doc.format}</span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                        background: `${statusColors[doc.status]}20`,
                        color: statusColors[doc.status]
                      }}>
                        {(doc.status === 'PENDING' || doc.status === 'GENERATING') && (
                          <Loader size={12} className="spin" />
                        )}
                        {doc.status}
                      </span>
                    </td>
                    <td>{doc.size ? formatSize(doc.size) : '-'}</td>
                    <td>{doc.generatedAt ? new Date(doc.generatedAt).toLocaleString() : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {doc.status === 'COMPLETED' && (
                          <button
                            onClick={() => handleDownload(doc)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            <Download size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <FileText size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No documents yet</h3>
          <p style={{ opacity: 0.6 }}>
            {hasData
              ? 'Click "Generate Documentation" to create your first document.'
              : 'Complete a crawl session first, then generate documentation.'}
          </p>
        </div>
      )}
    </div>
  )
}
