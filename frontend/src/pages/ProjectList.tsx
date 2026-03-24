import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Trash2, MoreVertical, Globe, FolderOpen } from 'lucide-react'
import { getProjects, deleteProject } from '../hooks/useApi'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SearchInput } from '../components/ui/SearchInput'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Dropdown } from '../components/ui/Dropdown'
import { Avatar } from '../components/ui/Avatar'
import { staggerContainer, staggerItem } from '../styles/animations'
import type { Project } from '../types'
import styles from './ProjectList.module.css'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const ProjectList = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

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

  const filteredProjects = projects.filter(p => {
    if (!search) return true
    const term = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(term) ||
      p.base_url.toLowerCase().includes(term)
    )
  })

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Skeleton variant="text" width={120} height={32} />
          </div>
          <div className={styles.headerRight}>
            <Skeleton variant="rectangular" width={200} height={36} />
            <Skeleton variant="rectangular" width={130} height={36} />
          </div>
        </div>
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rectangular" height={200} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Projects</h1>
          <Badge>{String(projects.length)}</Badge>
        </div>
        <div className={styles.headerRight}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search projects..."
          />
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => navigate('/projects/new')}
          >
            New Project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={48} />}
          title="No projects yet"
          description="Create your first project to start generating documentation."
          action={
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate('/projects/new')}
            >
              Create Project
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        <p className={styles.noResults}>No projects match your search.</p>
      ) : (
        <motion.div
          className={styles.grid}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filteredProjects.map(project => (
            <motion.div key={project.id} variants={staggerItem}>
              <Link to={`/projects/${project.id}`} className={styles.cardLink}>
                <Card variant="interactive">
                  <div className={styles.cardTop}>
                    <div className={styles.cardInfo}>
                      <Avatar name={project.name} size="md" />
                      <span className={styles.cardName}>{project.name}</span>
                    </div>
                    <div onClick={(e) => e.preventDefault()}>
                      <Dropdown
                        trigger={
                          <Button variant="ghost" size="sm">
                            <MoreVertical size={16} />
                          </Button>
                        }
                        items={[
                          {
                            label: 'Delete',
                            icon: <Trash2 size={14} />,
                            danger: true,
                            onClick: () => handleDelete(project.id),
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <p className={styles.cardDesc}>
                    {project.description || 'No description'}
                  </p>
                  <div className={styles.cardBottom}>
                    <span className={styles.cardUrl}>
                      <Globe size={12} />
                      {project.base_url}
                    </span>
                    <span className={styles.cardTime}>
                      {timeAgo(project.created_at)}
                    </span>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default ProjectList
