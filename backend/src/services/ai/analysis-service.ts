/**
 * Analysis Service - Post-crawl AI analysis of archived pages
 *
 * Runs after crawl completes. For each snapshot:
 * 1. Loads archived HTML + screenshot
 * 2. Extracts structural data (cheerio fallback)
 * 3. If LLM available, sends screenshot + DOM data for vision analysis
 * 4. Stores structured PageAnalysisResult in DB
 */

import { db } from '../../db/client'
import { promises as fs } from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'
import { appConfig } from '../../config/env'
import { tryGetLLMClient } from './llm-client'
import type { PageAnalysisResult } from './llm-client'

export interface AnalysisProgress {
  status: 'idle' | 'running' | 'completed' | 'failed'
  total: number
  analyzed: number
  currentUrl?: string
  error?: string
}

// Track active analysis sessions
const activeAnalysis = new Map<string, AnalysisProgress>()

export class AnalysisService {

  /**
   * Analyze all snapshots for a crawl session (or latest session for project)
   */
  async analyzeSession(projectId: string, crawlSessionId?: string): Promise<void> {
    // Find snapshots to analyze
    const where: any = { projectId }
    if (crawlSessionId) {
      where.crawlSessionId = crawlSessionId
    }

    const allSnapshots = await db.snapshot.findMany({
      where,
      orderBy: { capturedAt: 'asc' },
    })

    // Filter to only snapshots without analysis (avoids Prisma Json null filter issue)
    const snapshots = allSnapshots.filter(s => s.analysisJson === null || s.analysisJson === undefined)

    if (snapshots.length === 0) {
      activeAnalysis.set(projectId, {
        status: 'completed', total: 0, analyzed: 0,
      })
      return
    }

    const progress: AnalysisProgress = {
      status: 'running',
      total: snapshots.length,
      analyzed: 0,
    }
    activeAnalysis.set(projectId, progress)

    const llm = tryGetLLMClient()

    try {
      for (const snapshot of snapshots) {
        progress.currentUrl = snapshot.pageUrl

        try {
          const result = await this.analyzeSnapshot(snapshot, llm)

          await db.snapshot.update({
            where: { id: snapshot.id },
            data: { analysisJson: result as any },
          })

          progress.analyzed++
        } catch (error) {
          console.error(`Analysis failed for ${snapshot.pageUrl}:`, error)
          progress.analyzed++
        }
      }

      progress.status = 'completed'
      progress.currentUrl = undefined
    } catch (error) {
      progress.status = 'failed'
      progress.error = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  /**
   * Analyze a single snapshot
   */
  async analyzeSnapshot(
    snapshot: any,
    llm: ReturnType<typeof tryGetLLMClient>
  ): Promise<PageAnalysisResult> {
    // Try to find the archived HTML and screenshot
    const archivePath = appConfig.storage.archivePath
    const urlHash = snapshot.pageUrlHash
    const projectId = snapshot.projectId

    // Find the snapshot directory
    const urlDir = path.join(archivePath, projectId, urlHash)
    let htmlContent = ''
    let screenshotPath = ''

    try {
      const timestamps = await fs.readdir(urlDir)
      if (timestamps.length > 0) {
        // Use latest timestamp
        const latest = timestamps.sort().pop()!
        const snapshotDir = path.join(urlDir, latest)
        const htmlFile = path.join(snapshotDir, 'index.html')
        const ssFile = path.join(snapshotDir, 'screenshot.png')

        try { htmlContent = await fs.readFile(htmlFile, 'utf-8') } catch {}
        try {
          await fs.access(ssFile)
          screenshotPath = ssFile
        } catch {}
      }
    } catch {
      // Archive directory not found
    }

    // If LLM is available and we have a screenshot, use vision analysis
    if (llm && screenshotPath) {
      try {
        const domSummary = this.extractDomSummary(htmlContent, snapshot)
        const elements = this.extractElements(htmlContent)
        return await llm.analyzePage(screenshotPath, domSummary, elements)
      } catch (error) {
        console.warn(`LLM analysis failed for ${snapshot.pageUrl}, falling back to structural:`, error)
      }
    }

    // Fallback: structural analysis from HTML
    return this.structuralAnalysis(htmlContent, snapshot)
  }

  /**
   * Structural analysis without LLM - parses HTML to extract useful info
   */
  private structuralAnalysis(html: string, snapshot: any): PageAnalysisResult {
    if (!html) {
      return {
        page_purpose: snapshot.pageTitle || 'Unknown page',
        target_users: [],
        elements: [],
        steps: [],
        common_issues: [],
      }
    }

    const $ = cheerio.load(html)

    // Extract page purpose from headings and meta
    const h1 = $('h1').first().text().trim()
    const metaDesc = $('meta[name="description"]').attr('content') || ''
    const title = snapshot.pageTitle || $('title').text().trim()
    const purpose = h1
      ? `${title} - ${h1}`
      : metaDesc
        ? `${title}: ${metaDesc}`
        : title || 'Application page'

    // Extract form elements
    const elements: PageAnalysisResult['elements'] = []
    $('input, select, textarea').each((_, el) => {
      const $el = $(el)
      const name = $el.attr('name') || $el.attr('id') || ''
      const type = $el.attr('type') || el.tagName.toLowerCase()
      const label = $(`label[for="${$el.attr('id')}"]`).text().trim()
        || $el.attr('placeholder')
        || $el.attr('aria-label')
        || name

      if (label && type !== 'hidden') {
        elements.push({
          selector: name ? `[name="${name}"]` : el.tagName.toLowerCase(),
          description: `${label} (${type} field)`,
          user_action: type === 'select' ? 'Select an option' : `Enter ${label.toLowerCase()}`,
        })
      }
    })

    // Extract buttons
    $('button, input[type="submit"], [role="button"]').each((_, el) => {
      const text = $(el).text().trim() || $(el).attr('value') || 'Button'
      if (text.length > 0 && text.length < 100) {
        elements.push({
          selector: `button`,
          description: `"${text}" button`,
          user_action: `Click "${text}"`,
        })
      }
    })

    // Build steps from page structure
    const steps: string[] = []
    const headings = $('h1, h2, h3').slice(0, 5)
    if (headings.length > 0) {
      steps.push(`Navigate to ${title}`)
      headings.each((i, el) => {
        const text = $(el).text().trim()
        if (text) steps.push(`Review "${text}" section`)
      })
    }

    // Check for forms to generate form-specific steps
    const forms = $('form')
    if (forms.length > 0) {
      const formInputs = forms.first().find('input:not([type="hidden"]), select, textarea')
      formInputs.each((_, el) => {
        const label = $(`label[for="${$(el).attr('id')}"]`).text().trim()
          || $(el).attr('placeholder')
          || $(el).attr('name')
          || ''
        if (label) {
          steps.push(`Fill in "${label}"`)
        }
      })

      const submitBtn = forms.first().find('button[type="submit"], input[type="submit"]')
      if (submitBtn.length) {
        steps.push(`Click "${submitBtn.text().trim() || 'Submit'}"`)
      }
    }

    // Detect common issues
    const commonIssues: string[] = []
    const requiredFields = $('input[required], select[required], textarea[required]')
    if (requiredFields.length > 0) {
      commonIssues.push(`${requiredFields.length} required field(s) must be filled`)
    }
    if ($('input[type="password"]').length > 0) {
      commonIssues.push('Password field present - ensure password meets requirements')
    }
    if ($('input[type="email"]').length > 0) {
      commonIssues.push('Email field requires valid email format')
    }

    return {
      page_purpose: purpose,
      target_users: this.inferTargetUsers($),
      elements: elements.slice(0, 20),
      steps: steps.length > 1 ? steps : [`Navigate to ${title}`, 'Review page content'],
      common_issues: commonIssues,
    }
  }

  /**
   * Infer target users from page content
   */
  private inferTargetUsers($: cheerio.CheerioAPI): string[] {
    const bodyText = $('body').text().toLowerCase()
    const users: string[] = []

    if (bodyText.includes('admin') || bodyText.includes('manage')) users.push('Administrators')
    if (bodyText.includes('dashboard') || bodyText.includes('analytics')) users.push('Managers')
    if (bodyText.includes('settings') || bodyText.includes('profile')) users.push('All users')
    if (bodyText.includes('register') || bodyText.includes('sign up')) users.push('New users')

    return users.length > 0 ? users : ['General users']
  }

  /**
   * Extract DOM summary for LLM prompt
   */
  private extractDomSummary(html: string, snapshot: any): Record<string, any> {
    if (!html) {
      return { title: snapshot.pageTitle, url: snapshot.pageUrl }
    }

    const $ = cheerio.load(html)
    return {
      title: snapshot.pageTitle || $('title').text().trim(),
      url: snapshot.pageUrl,
      headings: $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().slice(0, 10),
      formCount: $('form').length,
      linkCount: $('a[href]').length,
      inputCount: $('input, select, textarea').length,
      buttonCount: $('button').length,
    }
  }

  /**
   * Extract elements for LLM prompt
   */
  private extractElements(html: string): Array<Record<string, any>> {
    if (!html) return []

    const $ = cheerio.load(html)
    const elements: Array<Record<string, any>> = []

    $('input:not([type="hidden"]), select, textarea').each((_, el) => {
      const $el = $(el)
      elements.push({
        type: $el.attr('type') || el.tagName.toLowerCase(),
        name: $el.attr('name') || '',
        label: $(`label[for="${$el.attr('id')}"]`).text().trim() || $el.attr('placeholder') || '',
        required: $el.attr('required') !== undefined,
      })
    })

    $('button, input[type="submit"]').each((_, el) => {
      elements.push({
        type: 'button',
        text: $(el).text().trim() || $(el).attr('value') || '',
      })
    })

    return elements.slice(0, 20)
  }

  /**
   * Get analysis progress for a project
   */
  getProgress(projectId: string): AnalysisProgress {
    return activeAnalysis.get(projectId) || {
      status: 'idle', total: 0, analyzed: 0,
    }
  }
}

export const analysisService = new AnalysisService()
