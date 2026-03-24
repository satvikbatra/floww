import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { createProject } from '../hooks/useApi'
import { Card, Button, Input } from '../components/ui'
import { slideUp } from '../styles/animations'
import styles from './ProjectCreate.module.css'

const ProjectCreate: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className={styles.page}
      variants={slideUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className={styles.header}>
        <Link to="/projects">
          <Button variant="ghost" icon={<ArrowLeft size={16} />}>
            Back to Projects
          </Button>
        </Link>
      </div>

      {/* Form Card */}
      <Card className={styles.formCard}>
        <h1 className={styles.formTitle}>Create New Project</h1>
        <p className={styles.formSubtitle}>
          Set up a new documentation project
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formBody}>
            {/* Project Name */}
            <Input
              label="Project Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="My Documentation Project"
              required
            />

            {/* Description (textarea) */}
            <div className={styles.textareaWrapper}>
              <label htmlFor="description" className={styles.textareaLabel}>
                Description
              </label>
              <textarea
                id="description"
                className={styles.textarea}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe your project..."
                rows={3}
              />
            </div>

            {/* Base URL */}
            <Input
              label="Base URL"
              type="url"
              value={formData.baseUrl}
              onChange={(e) =>
                setFormData({ ...formData, baseUrl: e.target.value })
              }
              placeholder="https://example.com"
              required
              helper="The starting URL for the crawler"
            />

            {/* Advanced Options Toggle */}
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options
              <span
                className={`${styles.chevron} ${showAdvanced ? styles.chevronOpen : ''}`}
              >
                <ChevronDown size={16} />
              </span>
            </button>

            {/* Advanced Options Content */}
            {showAdvanced && (
              <motion.div
                className={styles.advancedContent}
                variants={slideUp}
                initial="hidden"
                animate="visible"
              >
                <div className={styles.advancedGrid}>
                  <Input
                    label="Max Pages"
                    type="number"
                    value={String(formData.maxPages)}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxPages: parseInt(e.target.value) || 0,
                      })
                    }
                    min={1}
                    max={10000}
                  />
                  <Input
                    label="Max Depth"
                    type="number"
                    value={String(formData.maxDepth)}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxDepth: parseInt(e.target.value) || 0,
                      })
                    }
                    min={1}
                    max={10}
                  />
                </div>

                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    id="respectRobotsTxt"
                    className={styles.checkbox}
                    checked={formData.respectRobotsTxt}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        respectRobotsTxt: e.target.checked,
                      })
                    }
                  />
                  <label
                    htmlFor="respectRobotsTxt"
                    className={styles.checkboxLabel}
                  >
                    Respect robots.txt
                  </label>
                </div>

                <div className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    id="followExternalLinks"
                    className={styles.checkbox}
                    checked={formData.followExternalLinks}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        followExternalLinks: e.target.checked,
                      })
                    }
                  />
                  <label
                    htmlFor="followExternalLinks"
                    className={styles.checkboxLabel}
                  >
                    Follow external links
                  </label>
                </div>
              </motion.div>
            )}

            {/* Form Actions */}
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
              >
                Create Project
              </Button>
              <Link to="/projects">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </form>
      </Card>
    </motion.div>
  )
}

export default ProjectCreate
