import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Archive } from 'lucide-react'
import { getSnapshots } from '../hooks/useApi'
import {
  Card,
  Button,
  Badge,
  SearchInput,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  EmptyState,
} from '../components/ui'
import { slideUp } from '../styles/animations'
import type { PageSnapshot } from '../types'
import styles from './ArchiveBrowser.module.css'

const ArchiveBrowser: React.FC = () => {
  const [projectId, setProjectId] = useState('')
  const [snapshots, setSnapshots] = useState<PageSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [searchUrl, setSearchUrl] = useState('')
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!projectId) return

    setLoading(true)
    setSearched(true)
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
    <motion.div
      className={styles.page}
      variants={slideUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Archive Browser</h1>
        <p className={styles.subtitle}>
          Browse and compare archived page snapshots
        </p>
      </div>

      {/* Search / Filter Bar */}
      <Card>
        <div className={styles.filterBar}>
          <div className={styles.filterField}>
            <Input
              label="Project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="Enter project ID"
            />
          </div>
          <div className={styles.filterField}>
            <SearchInput
              value={searchUrl}
              onChange={setSearchUrl}
              placeholder="Filter by URL..."
            />
          </div>
          <div className={styles.searchButton}>
            <Button
              variant="primary"
              icon={<Search size={16} />}
              onClick={handleSearch}
              disabled={loading || !projectId}
              loading={loading}
            >
              Search
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading Skeleton */}
      {loading && (
        <div className={styles.skeletonTable}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <Skeleton variant="text" width="30%" height={20} />
              <Skeleton variant="text" width="20%" height={20} />
              <Skeleton variant="text" width="10%" height={20} />
              <Skeleton variant="text" width="15%" height={20} />
              <Skeleton variant="text" width="10%" height={20} />
              <Skeleton variant="text" width="8%" height={20} />
            </div>
          ))}
        </div>
      )}

      {/* Results Table */}
      {!loading && snapshots.length > 0 && (
        <motion.div
          className={styles.resultsSection}
          variants={slideUp}
          initial="hidden"
          animate="visible"
        >
          <h2 className={styles.resultsTitle}>
            Snapshots ({snapshots.length})
          </h2>
          <Card padding="none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Captured</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>
                      <span
                        className={styles.urlCell}
                        title={snapshot.url}
                      >
                        {snapshot.url}
                      </span>
                    </TableCell>
                    <TableCell>{snapshot.title}</TableCell>
                    <TableCell>
                      <Badge variant="default">{snapshot.snapshot_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(snapshot.captured_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          snapshot.http_status === 200 ? 'success' : 'error'
                        }
                      >
                        {snapshot.http_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{snapshot.resource_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </motion.div>
      )}

      {/* Empty State */}
      {!loading && snapshots.length === 0 && searched && (
        <div className={styles.emptyWrapper}>
          <EmptyState
            icon={<Archive size={48} />}
            title="No snapshots found"
            description="Run a crawl to create archives, or adjust your search filters."
          />
        </div>
      )}
    </motion.div>
  )
}

export default ArchiveBrowser
