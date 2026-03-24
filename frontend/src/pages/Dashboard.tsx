import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Globe, FileText, Activity, ArrowRight } from 'lucide-react'
import { getProjects, getCrawlSessions } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

import { Skeleton } from '../components/ui/Skeleton'
import { staggerContainer, staggerItem } from '../styles/animations'
import type { Project, CrawlSession } from '../types'
import styles from './Dashboard.module.css'

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const getFirstName = (user: { fullName?: string; username: string } | null): string => {
  if (!user) return ''
  if (user.fullName) {
    return user.fullName.split(' ')[0]
  }
  return user.username
}

export default function Dashboard() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [allSessions, setAllSessions] = useState<CrawlSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const projectsRes = await getProjects()
      const projectsList = projectsRes.data.projects || []
      setProjects(projectsList)

      const sessionsPromises = projectsList.slice(0, 10).map((p: Project) =>
        getCrawlSessions(p.id).catch(() => ({ data: { sessions: [] } }))
      )
      const sessionsResults = await Promise.all(sessionsPromises)
      const sessions = sessionsResults.flatMap(r => r.data.sessions || [])
      setAllSessions(sessions)
    } catch (error) {
      console.error('Failed to load dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalProjects = projects.length
  const totalPages = allSessions.reduce((sum, s) => sum + (s.pages_visited || 0), 0)
  const activeCrawls = allSessions.filter(s => s.status === 'RUNNING').length
  const documentsGenerated = 0
  const recentProjects = projects.slice(0, 4)

  const metrics = [
    {
      label: 'Total Projects',
      value: totalProjects,
      icon: <Globe size={20} />,
    },
    {
      label: 'Pages Crawled',
      value: totalPages,
      icon: <Globe size={20} />,
    },
    {
      label: 'Active Crawls',
      value: activeCrawls,
      icon: <Activity size={20} />,
      hasActiveDot: activeCrawls > 0,
    },
    {
      label: 'Documents Generated',
      value: documentsGenerated,
      icon: <FileText size={20} />,
    },
  ]

  return (
    <div className={styles.page}>
      {/* Welcome Header */}
      <motion.div
        className={styles.header}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.h1 className={styles.greeting} variants={staggerItem}>
          {getGreeting()}, {getFirstName(user)}
        </motion.h1>
        <motion.p className={styles.date} variants={staggerItem}>
          {formatDate(new Date())}
        </motion.p>
      </motion.div>

      {/* Metrics Grid */}
      <motion.div
        className={styles.metricsGrid}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <motion.div key={i} variants={staggerItem}>
                <Card variant="elevated">
                  <div className={styles.metricCard}>
                    <Skeleton variant="rectangular" width={44} height={44} className={styles.skeletonIcon} />
                    <Skeleton variant="rectangular" width={60} height={30} />
                    <Skeleton variant="text" width={100} />
                  </div>
                </Card>
              </motion.div>
            ))
          : metrics.map((metric) => (
              <motion.div key={metric.label} variants={staggerItem}>
                <Card variant="elevated">
                  <div className={styles.metricCard}>
                    <div className={styles.metricIcon}>{metric.icon}</div>
                    <div className={styles.metricValue}>
                      {metric.hasActiveDot && <span className={styles.activeDot} />}
                      {metric.value}
                    </div>
                    <div className={styles.metricLabel}>{metric.label}</div>
                  </div>
                </Card>
              </motion.div>
            ))}
      </motion.div>

      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <Link to="/projects/new">
          <Button variant="primary" icon={<Plus size={16} />}>
            New Project
          </Button>
        </Link>
      </div>

      {/* Recent Projects */}
      <motion.div
        className={styles.section}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className={styles.sectionHeader}>
          <motion.h2 className={styles.sectionTitle} variants={staggerItem}>
            Recent Projects
          </motion.h2>
          {projects.length > 4 && (
            <motion.div variants={staggerItem}>
              <Link to="/projects" className={styles.viewAll}>
                View all <ArrowRight size={14} />
              </Link>
            </motion.div>
          )}
        </div>

        <div className={styles.projectsGrid}>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <motion.div key={i} variants={staggerItem}>
                  <Card variant="interactive">
                    <div className={styles.projectCard}>
                      <Skeleton variant="text" width="60%" />
                      <Skeleton variant="text" width="80%" />
                      <Skeleton variant="text" width="90%" lines={2} />
                    </div>
                  </Card>
                </motion.div>
              ))
            : recentProjects.length === 0 ? (
                <motion.div className={styles.emptyState} variants={staggerItem}>
                  <Card variant="elevated">
                    <div className={styles.emptyContent}>
                      <p className={styles.emptyText}>
                        No projects yet. Create your first project to start generating documentation.
                      </p>
                      <Link to="/projects/new">
                        <Button variant="primary" icon={<Plus size={16} />}>
                          Create Project
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </motion.div>
              )
            : recentProjects.map((project) => (
                <motion.div key={project.id} variants={staggerItem}>
                  <Link to={`/projects/${project.id}`} className={styles.projectLink}>
                    <Card variant="interactive">
                      <div className={styles.projectCard}>
                        <div className={styles.projectName}>{project.name}</div>
                        <div className={styles.projectUrl}>{project.base_url}</div>
                        {project.description && (
                          <div className={styles.projectDesc}>{project.description}</div>
                        )}
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
        </div>
      </motion.div>
    </div>
  )
}
