import React, { useState } from 'react'
import { Calendar, Clock, GitCompare, Search } from 'lucide-react'
import { getSnapshots, getTimeline, getArchiveStats } from '../hooks/useApi'
import type { PageSnapshot } from '../types'

const ArchiveBrowser: React.FC = () => {
  const [projectId, setProjectId] = useState('')
  const [snapshots, setSnapshots] = useState<PageSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [searchUrl, setSearchUrl] = useState('')

  const handleSearch = async () => {
    if (!projectId) return
    
    setLoading(true)
    try {
      const response = await getSnapshots(projectId, searchUrl || undefined)
      setSnapshots(response.data.snapshots || [])
    } catch (error) {
      console.error('Failed to load snapshots:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Archive Browser</h2>
        <p>Browse and compare archived page snapshots</p>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex gap-4">
          <div className="form-group flex-1">
            <label className="form-label">Project ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="Enter project ID"
              className="form-input"
            />
          </div>
          <div className="form-group flex-1">
            <label className="form-label">URL Filter (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder="Filter by URL"
                className="form-input"
              />
              <button 
                onClick={handleSearch}
                className="btn btn-primary"
                disabled={loading || !projectId}
              >
                <Search size={18} />
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {snapshots.length > 0 && (
        <div className="card">
          <h3 className="card-title mb-4">
            Snapshots ({snapshots.length})
          </h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Captured</th>
                  <th>Status</th>
                  <th>Resources</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(snapshot => (
                  <tr key={snapshot.id}>
                    <td>
                      <code className="text-sm">{snapshot.url.substring(0, 50)}...</code>
                    </td>
                    <td>{snapshot.title}</td>
                    <td>
                      <span className="badge">{snapshot.snapshot_type}</span>
                    </td>
                    <td>{new Date(snapshot.captured_at).toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${snapshot.http_status === 200 ? 'success' : 'error'}`}>
                        {snapshot.http_status}
                      </span>
                    </td>
                    <td>{snapshot.resource_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && snapshots.length === 0 && projectId && (
        <div className="card p-8 text-center">
          <p className="text-muted">No snapshots found. Run a crawl to create archives.</p>
        </div>
      )}
    </div>
  )
}

export default ArchiveBrowser
