/**
 * Archive Backup/Restore — Export and import archive data
 *
 * Creates tar.gz backups of project archives for:
 * - Disaster recovery
 * - Migration between environments
 * - User data export (GDPR compliance)
 */

import { promises as fs } from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { appConfig } from '../../config/env'
import { archiveLogger } from '../../utils/logger'

const execAsync = promisify(exec)

/**
 * Create a backup of a project's archive data
 */
export async function backupProject(
  projectId: string,
  outputDir: string
): Promise<{ backupPath: string; sizeBytes: number } | null> {
  const archivePath = appConfig.storage.archivePath
  const projectDir = path.join(archivePath, projectId)

  try {
    await fs.access(projectDir)
  } catch {
    archiveLogger.warn('No archive data found for project', { projectId })
    return null
  }

  await fs.mkdir(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(outputDir, `floww-backup-${projectId}-${timestamp}.tar.gz`)

  try {
    await execAsync(`tar -czf "${backupFile}" -C "${archivePath}" "${projectId}"`)
    const stat = await fs.stat(backupFile)
    archiveLogger.info('Project backup created', {
      projectId,
      backupPath: backupFile,
      sizeMB: Math.round(stat.size / 1024 / 1024 * 10) / 10,
    })
    return { backupPath: backupFile, sizeBytes: stat.size }
  } catch (error) {
    archiveLogger.error('Backup failed', error, { projectId })
    return null
  }
}

/**
 * Restore a project archive from backup
 */
export async function restoreProject(
  backupPath: string,
  targetProjectId?: string
): Promise<boolean> {
  const archivePath = appConfig.storage.archivePath

  try {
    await fs.access(backupPath)
  } catch {
    archiveLogger.error('Backup file not found', null, { backupPath })
    return false
  }

  try {
    await fs.mkdir(archivePath, { recursive: true })
    await execAsync(`tar -xzf "${backupPath}" -C "${archivePath}"`)
    archiveLogger.info('Project restored from backup', { backupPath, targetProjectId })
    return true
  } catch (error) {
    archiveLogger.error('Restore failed', error, { backupPath })
    return false
  }
}

/**
 * Export all data for a user (GDPR compliance)
 */
export async function exportUserData(
  userId: string,
  projectIds: string[],
  outputDir: string
): Promise<string | null> {
  await fs.mkdir(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const exportDir = path.join(outputDir, `floww-export-${userId}-${timestamp}`)
  await fs.mkdir(exportDir, { recursive: true })

  for (const projectId of projectIds) {
    await backupProject(projectId, exportDir)
  }

  // Create final tar.gz of all project backups
  const exportFile = `${exportDir}.tar.gz`
  try {
    await execAsync(`tar -czf "${exportFile}" -C "${outputDir}" "${path.basename(exportDir)}"`)
    await fs.rm(exportDir, { recursive: true, force: true })
    archiveLogger.info('User data exported', { userId, exportPath: exportFile })
    return exportFile
  } catch (error) {
    archiveLogger.error('User data export failed', error, { userId })
    return null
  }
}
