/**
 * Document Generator - Produces rich documentation from crawl data
 *
 * Generates Markdown/HTML docs with:
 * - AI analysis results (page purpose, steps, elements)
 * - Embedded screenshots
 * - Detected workflows
 * - Table of contents
 * - Statistics
 */

import { promises as fs } from 'fs'
import path from 'path'
import { marked } from 'marked'
import { appConfig, env } from '../../config/env'
import { KnowledgeGraph } from '../graph/knowledge-graph'
import { tryGetLLMClient } from '../ai/llm-client'
import { db } from '../../db/client'
import type { PageAnalysisResult } from '../ai/llm-client'
import { DocPipeline, type PipelinePage } from './doc-pipeline'

export interface DocGenerationOptions {
  projectId: string
  projectName: string
  projectUrl: string
  crawlSessionId?: string
  format: 'MARKDOWN' | 'HTML'
  includeScreenshots: boolean
  includeAiAnalysis: boolean
  language: string
}

interface PageDocData {
  url: string
  title: string
  screenshotPath?: string
  analysis?: PageAnalysisResult
  urlHash: string
}

export class DocumentGenerator {
  /**
   * Main generation method - produces full documentation
   */
  async generateFullDocumentation(
    graph: KnowledgeGraph,
    options: DocGenerationOptions
  ): Promise<{ content: string; outputPath: string; screenshotDir?: string }> {
    // Load snapshot data from DB
    const where: any = { projectId: options.projectId }
    if (options.crawlSessionId) {
      where.crawlSessionId = options.crawlSessionId
    }

    // Load snapshots in batches to avoid OOM on large crawls
    const PAGE_SIZE = 50
    const snapshots: any[] = []
    let skip = 0
    while (true) {
      const batch = await db.snapshot.findMany({
        where,
        orderBy: { capturedAt: 'asc' },
        take: PAGE_SIZE,
        skip,
        select: {
          pageUrl: true,
          pageTitle: true,
          screenshotPath: true,
          analysisJson: true,
          pageUrlHash: true,
          httpStatus: true,
          loadTimeMs: true,
        },
      })
      snapshots.push(...batch)
      if (batch.length < PAGE_SIZE) break
      skip += PAGE_SIZE
    }

    // Build page data
    const pages: PageDocData[] = snapshots.map(s => ({
      url: s.pageUrl,
      title: s.pageTitle,
      screenshotPath: s.screenshotPath || undefined,
      analysis: options.includeAiAnalysis && s.analysisJson
        ? s.analysisJson as unknown as PageAnalysisResult
        : undefined,
      urlHash: s.pageUrlHash,
    }))

    // Get workflows from graph
    const workflows = graph.detectWorkflows()
    const stats = graph.getStats()

    // Prepare screenshot directory
    let screenshotDir: string | undefined
    if (options.includeScreenshots) {
      screenshotDir = path.join(appConfig.storage.outputPath, 'documents', options.projectId, 'screenshots')
      await fs.mkdir(screenshotDir, { recursive: true })
      await this.copyScreenshots(pages, options.projectId, screenshotDir)
    }

    // Generate markdown — multi-pass pipeline if LLM available, fallback to structural
    const llm = tryGetLLMClient()
    let markdown: string

    if (llm) {
      try {
        // Build rich page data with all crawl info
        const pipelinePages = await this.buildPipelinePages(pages, options.projectId)
        const navEdges = this.getNavigationEdges(graph)

        // Copy screenshots with numbered names for pipeline (./screenshots/1.png, ./screenshots/2.png)
        if (screenshotDir) {
          await this.copyScreenshotsNumbered(pipelinePages, screenshotDir)
        }

        // Run multi-pass pipeline
        const pipeline = new DocPipeline(llm)
        const result = await pipeline.run(
          options.projectName,
          options.projectUrl,
          pipelinePages,
          navEdges,
        )
        markdown = result.markdown
      } catch (error) {
        console.warn('Pipeline doc generation failed, falling back to structural:', error)
        markdown = this.buildMarkdown(pages, workflows, stats, options, !!screenshotDir)
      }
    } else {
      markdown = this.buildMarkdown(pages, workflows, stats, options, !!screenshotDir)
    }

    // Translate if needed
    if (options.language !== 'en' && llm) {
      try {
        markdown = await llm.translate(markdown, options.language)
      } catch (error) {
        console.warn('Translation failed, using English:', error)
      }
    }

    // Convert format
    let content = markdown
    let filename = `documentation.md`

    if (options.format === 'HTML') {
      content = await this.renderHTML(markdown, options, pages, screenshotDir)
      filename = `documentation.html`
    }

    // Save to disk
    const outputDir = path.join(appConfig.storage.outputPath, 'documents', options.projectId)
    await fs.mkdir(outputDir, { recursive: true })
    const outputPath = path.join(outputDir, filename)
    await fs.writeFile(outputPath, content, 'utf-8')

    return { content, outputPath, screenshotDir }
  }

  /**
   * Build Markdown documentation
   */
  private buildMarkdown(
    pages: PageDocData[],
    workflows: Array<{ name: string; description: string; steps: Array<{ page: string; action: string }> }>,
    stats: { nodes: number; edges: number; pages: number; elements: number },
    options: DocGenerationOptions,
    hasScreenshots: boolean
  ): string {
    const lines: string[] = []

    // Title
    lines.push(`# ${options.projectName} - User Documentation`)
    lines.push('')
    lines.push(`> Auto-generated documentation for [${options.projectUrl}](${options.projectUrl})`)
    lines.push(`> Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    // Table of Contents
    lines.push('## Table of Contents')
    lines.push('')
    lines.push('- [Overview](#overview)')
    if (pages.length > 0) lines.push('- [Pages](#pages)')
    if (workflows.length > 0) lines.push('- [Workflows](#workflows)')
    lines.push('- [Statistics](#statistics)')
    lines.push('')

    // Indent page links in TOC
    for (const page of pages) {
      const anchor = this.slugify(page.title || page.url)
      lines.push(`  - [${page.title || page.url}](#${anchor})`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // Overview
    lines.push('## Overview')
    lines.push('')
    lines.push(`This documentation covers **${pages.length} pages** of the ${options.projectName} application.`)
    if (stats.elements > 0) {
      lines.push(`The application contains **${stats.elements} interactive elements** across all pages.`)
    }
    if (workflows.length > 0) {
      lines.push(`**${workflows.length} user workflows** have been identified.`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // Pages
    if (pages.length > 0) {
      lines.push('## Pages')
      lines.push('')

      for (const page of pages) {
        lines.push(`### ${page.title || 'Untitled Page'}`)
        lines.push('')
        lines.push(`**URL:** \`${page.url}\``)
        lines.push('')

        // Screenshot
        if (hasScreenshots) {
          lines.push(`![${page.title}](./screenshots/${page.urlHash}.png)`)
          lines.push('')
        }

        if (page.analysis) {
          // AI-enhanced page documentation
          const a = page.analysis

          // Purpose
          if (a.page_purpose) {
            lines.push(`**Purpose:** ${a.page_purpose}`)
            lines.push('')
          }

          // Target users
          if (a.target_users && a.target_users.length > 0) {
            lines.push(`**Target Users:** ${a.target_users.join(', ')}`)
            lines.push('')
          }

          // Steps
          if (a.steps && a.steps.length > 0) {
            lines.push('#### How to Use')
            lines.push('')
            for (const step of a.steps) {
              lines.push(`1. ${step}`)
            }
            lines.push('')
          }

          // Elements table
          if (a.elements && a.elements.length > 0) {
            lines.push('#### UI Elements')
            lines.push('')
            lines.push('| Element | Description | Action |')
            lines.push('|---------|-------------|--------|')
            for (const el of a.elements) {
              const desc = (el.description || '').replace(/\|/g, '\\|')
              const action = (el.user_action || '').replace(/\|/g, '\\|')
              lines.push(`| \`${el.selector}\` | ${desc} | ${action} |`)
            }
            lines.push('')
          }

          // Common issues
          if (a.common_issues && a.common_issues.length > 0) {
            lines.push('#### Common Issues')
            lines.push('')
            for (const issue of a.common_issues) {
              lines.push(`- ${issue}`)
            }
            lines.push('')
          }
        } else {
          // Basic page info without AI
          lines.push('*No detailed analysis available. Run AI analysis for enhanced documentation.*')
          lines.push('')
        }

        lines.push('---')
        lines.push('')
      }
    }

    // Workflows
    if (workflows.length > 0) {
      lines.push('## Workflows')
      lines.push('')

      for (let i = 0; i < workflows.length; i++) {
        const workflow = workflows[i]
        lines.push(`### ${i + 1}. ${workflow.name}`)
        lines.push('')
        if (workflow.description) {
          lines.push(workflow.description)
          lines.push('')
        }

        for (let j = 0; j < workflow.steps.length; j++) {
          const step = workflow.steps[j]
          lines.push(`${j + 1}. **${step.action}** on *${step.page}*`)
        }
        lines.push('')
        lines.push('---')
        lines.push('')
      }
    }

    // Statistics
    lines.push('## Statistics')
    lines.push('')
    lines.push('| Metric | Value |')
    lines.push('|--------|-------|')
    lines.push(`| Total Pages | ${pages.length} |`)
    lines.push(`| Total UI Elements | ${stats.elements} |`)
    lines.push(`| Graph Nodes | ${stats.nodes} |`)
    lines.push(`| Graph Edges | ${stats.edges} |`)
    lines.push(`| Detected Workflows | ${workflows.length} |`)
    lines.push(`| Pages with AI Analysis | ${pages.filter(p => p.analysis).length} |`)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(`*Generated by Floww on ${new Date().toLocaleString()}*`)

    return lines.join('\n')
  }

  /**
   * Render HTML from markdown with a proper template
   */
  private async renderHTML(
    markdown: string,
    options: DocGenerationOptions,
    pages: PageDocData[],
    screenshotDir?: string
  ): Promise<string> {
    let htmlBody = await marked(markdown)

    // Inline screenshots as base64 if screenshotDir exists
    if (screenshotDir) {
      for (const page of pages) {
        const ssPath = path.join(screenshotDir, `${page.urlHash}.png`)
        try {
          const buffer = await fs.readFile(ssPath)
          const base64 = buffer.toString('base64')
          htmlBody = htmlBody.replace(
            `src="./screenshots/${page.urlHash}.png"`,
            `src="data:image/png;base64,${base64}"`
          )
        } catch {
          // Screenshot not found, leave as-is
        }
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.projectName} - Documentation</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.7;
            max-width: 960px;
            margin: 0 auto;
            padding: 40px 24px;
            color: #1a1a2e;
            background: #fafbfc;
        }
        h1 { font-size: 2.2em; color: #1a1a2e; border-bottom: 3px solid #667eea; padding-bottom: 12px; margin-bottom: 8px; }
        h2 { font-size: 1.6em; color: #2d3748; margin-top: 48px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        h3 { font-size: 1.25em; color: #4a5568; margin-top: 32px; margin-bottom: 12px; }
        h4 { font-size: 1.05em; color: #667eea; margin-top: 20px; margin-bottom: 8px; }
        p { margin-bottom: 12px; }
        code { background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        pre { background: #2d3748; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; }
        blockquote { border-left: 4px solid #667eea; padding: 12px 20px; margin: 16px 0; background: #f0f4ff; border-radius: 0 8px 8px 0; color: #4a5568; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; }
        th { background: #667eea; color: white; font-weight: 600; }
        tr:nth-child(even) { background: #f7fafc; }
        img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; margin: 12px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 32px 0; }
        ol, ul { padding-left: 24px; margin-bottom: 12px; }
        li { margin-bottom: 4px; }
        a { color: #667eea; text-decoration: none; }
        a:hover { text-decoration: underline; }
        strong { color: #2d3748; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; background: #667eea20; color: #667eea; }
    </style>
</head>
<body>
${htmlBody}
</body>
</html>`
  }

  /**
   * Copy screenshots from archive to output directory
   */
  private async copyScreenshots(
    pages: PageDocData[],
    projectId: string,
    outputDir: string
  ): Promise<void> {
    const archivePath = appConfig.storage.archivePath

    for (const page of pages) {
      try {
        const urlDir = path.join(archivePath, projectId, page.urlHash)
        const timestamps = await fs.readdir(urlDir)
        if (timestamps.length === 0) continue

        const latest = timestamps.sort().pop()!
        const srcScreenshot = path.join(urlDir, latest, 'screenshot.png')

        try {
          await fs.access(srcScreenshot)
          const destScreenshot = path.join(outputDir, `${page.urlHash}.png`)
          await fs.copyFile(srcScreenshot, destScreenshot)
        } catch {
          // Screenshot doesn't exist
        }
      } catch {
        // Archive dir doesn't exist
      }
    }
  }

  /**
   * Build pipeline page data from crawl archives (HTML + screenshots)
   */
  private async buildPipelinePages(
    pages: PageDocData[],
    projectId: string
  ): Promise<PipelinePage[]> {
    const archivePath = appConfig.storage.archivePath
    const result: PipelinePage[] = []

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      let headings: string[] = []
      let forms = 0
      let buttons: string[] = []
      let links = 0
      let screenshotPath: string | undefined

      try {
        const urlDir = path.join(archivePath, projectId, page.urlHash)
        const timestamps = await fs.readdir(urlDir)
        if (timestamps.length > 0) {
          const latest = timestamps.sort().pop()!
          const snapshotDir = path.join(urlDir, latest)

          try {
            const cheerio = await import('cheerio')
            const html = await fs.readFile(path.join(snapshotDir, 'index.html'), 'utf-8')
            const $ = cheerio.load(html)
            headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10)
            forms = $('form').length
            buttons = $('button, input[type="submit"], [role="button"]')
              .map((_, el) => $(el).text().trim())
              .get()
              .filter((t: string) => t.length > 0 && t.length < 50)
              .slice(0, 10)
            links = $('a[href]').length
          } catch { /* HTML not available */ }

          try {
            const ssFile = path.join(snapshotDir, 'screenshot.png')
            await fs.access(ssFile)
            screenshotPath = ssFile
          } catch { /* no screenshot */ }
        }
      } catch { /* archive dir not found */ }

      result.push({
        index: i,
        url: page.url,
        title: page.title,
        urlHash: page.urlHash,
        headings,
        forms,
        buttons,
        links,
        screenshotPath,
      })
    }

    return result
  }

  /**
   * Copy screenshots with numbered filenames (1.png, 2.png, ...) for pipeline output
   */
  private async copyScreenshotsNumbered(
    pages: PipelinePage[],
    outputDir: string
  ): Promise<void> {
    for (const page of pages) {
      if (!page.screenshotPath) continue
      try {
        const dest = path.join(outputDir, `${page.index + 1}.png`)
        await fs.copyFile(page.screenshotPath, dest)
      } catch { /* skip */ }
    }
  }

  /**
   * Extract navigation edges from knowledge graph
   */
  private getNavigationEdges(graph: KnowledgeGraph): Array<{ from: string; to: string }> {
    try {
      const graphData = graph.export()
      if (!graphData.edges || graphData.edges.length === 0) return []

      return graphData.edges
        .map((e: any) => ({ from: e.source, to: e.target }))
        .slice(0, 50)
    } catch {
      return []
    }
  }

  /**
   * Generate slug from text for anchor links
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  /**
   * Save document content to disk
   */
  async save(content: string, projectId: string, filename: string): Promise<string> {
    const docsDir = path.join(appConfig.storage.outputPath, 'documents', projectId)
    await fs.mkdir(docsDir, { recursive: true })
    const filePath = path.join(docsDir, filename)
    await fs.writeFile(filePath, content, 'utf-8')
    return filePath
  }
}

export const documentGenerator = new DocumentGenerator()
