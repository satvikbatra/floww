import React, { useEffect, useState } from 'react'
import { Plus, Trash2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getProjects, deleteProject } from '../hooks/useApi'
import type { Project } from '../types'

const ProjectList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await getProjects()
      setProjects(response.data.projects || [])
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return
    
    try {
      await deleteProject(id)
      setProjects(projects.filter(p => p.id !== id))
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h2>Projects</h2>
            <p>Manage your documentation projects</p>
          </div>
          <Link to="/projects/new" className="btn btn-primary">
            <Plus size={20} />
            New Project
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center p-8">
          <p className="text-muted mb-4">No projects yet. Create your first project to start generating documentation.</p>
          <Link to="/projects/new" className="btn btn-primary">
            <Plus size={20} />
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-3">
          {projects.map(project => (
            <div key={project.id} className="card">
              <div className="card-header">
                <h3 className="card-title">{project.name}</h3>
                <button 
                  onClick={() => handleDelete(project.id)}
                  className="btn btn-secondary"
                  title="Delete project"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <p className="text-muted mb-4">{project.description || 'No description'}</p>
              
              <div className="flex items-center gap-2 text-muted mb-4">
                <ExternalLink size={16} />
                <code className="text-sm">{project.base_url}</code>
              </div>
              
              <Link to={`/projects/${project.id}`} className="btn btn-primary w-full">
                View Details
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProjectList
