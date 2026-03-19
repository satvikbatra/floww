import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createProject } from '../hooks/useApi'

const ProjectCreate: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    baseUrl: '',
    maxPages: 100,
    maxDepth: 3,
    respectRobotsTxt: true,
    followExternalLinks: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await createProject({
        name: formData.name,
        description: formData.description,
        baseUrl: formData.baseUrl,
        config: {
          maxPages: formData.maxPages,
          maxDepth: formData.maxDepth,
          respectRobotsTxt: formData.respectRobotsTxt,
          followExternalLinks: formData.followExternalLinks,
        },
      })

      navigate(`/projects/${response.data.id}`)
    } catch (error: any) {
      console.error('Failed to create project:', error)
      alert(error.response?.data?.error || 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/projects" className="btn btn-secondary">
          <ArrowLeft size={20} />
          Back to Projects
        </Link>
      </div>

      <div className="card max-w-2xl mx-auto">
        <h2 className="card-title mb-6">Create New Project</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Project Name *</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Documentation Project"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe your project..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="baseUrl">Base URL *</label>
            <input
              type="url"
              id="baseUrl"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              placeholder="https://example.com"
              required
            />
            <small className="text-muted">The starting URL for the crawler</small>
          </div>

          <div className="grid grid-2 gap-4">
            <div className="form-group">
              <label htmlFor="maxPages">Max Pages</label>
              <input
                type="number"
                id="maxPages"
                value={formData.maxPages}
                onChange={(e) => setFormData({ ...formData, maxPages: parseInt(e.target.value) })}
                min="1"
                max="10000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxDepth">Max Depth</label>
              <input
                type="number"
                id="maxDepth"
                value={formData.maxDepth}
                onChange={(e) => setFormData({ ...formData, maxDepth: parseInt(e.target.value) })}
                min="1"
                max="10"
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.respectRobotsTxt}
                onChange={(e) => setFormData({ ...formData, respectRobotsTxt: e.target.checked })}
              />
              {' '}Respect robots.txt
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.followExternalLinks}
                onChange={(e) => setFormData({ ...formData, followExternalLinks: e.target.checked })}
              />
              {' '}Follow external links
            </label>
          </div>

          <div className="flex gap-3 mt-6">
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
            <Link to="/projects" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectCreate
