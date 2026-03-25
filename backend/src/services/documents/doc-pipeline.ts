/**
 * Multi-Pass Documentation Pipeline
 *
 * Generates production-quality documentation through 4 passes:
 *
 * Pass 1 — Page Analysis: Per-page vision analysis with screenshots.
 *          LLM sees each screenshot and describes exactly what's on screen.
 *
 * Pass 2 — Information Architecture: Groups pages into logical sections,
 *          determines doc structure, ordering, and hierarchy.
 *
 * Pass 3 — Section Generation: For each section, generates detailed
 *          task-oriented documentation with step-by-step instructions.
 *
 * Pass 4 — Assembly: Stitches sections together with intro, TOC,
 *          getting started guide, and cross-references.
 */

import type { LLMClient } from '../ai/llm-client'

// ── Types ──────────────────────────────────────────────────────

export interface PipelinePage {
  index: number
  url: string
  title: string
  urlHash: string
  headings: string[]
  forms: number
  buttons: string[]
  links: number
  screenshotPath?: string
}

export interface PageAnalysis {
  index: number
  url: string
  title: string
  purpose: string
  whatUserSees: string
  keyElements: string[]
  userActions: string[]
  screenshotPath?: string
}

export interface DocSection {
  name: string
  description: string
  pages: number[]  // indices into PageAnalysis[]
}

export interface DocArchitecture {
  appName: string
  appDescription: string
  sections: DocSection[]
  gettingStartedPages: number[]
}

export interface PipelineResult {
  markdown: string
  pageCount: number
  sectionCount: number
}

// ── Pipeline ───────────────────────────────────────────────────

export class DocPipeline {
  private llm: LLMClient

  constructor(llm: LLMClient) {
    this.llm = llm
  }

  async run(
    projectName: string,
    projectUrl: string,
    pages: PipelinePage[],
    navEdges: Array<{ from: string; to: string }>,
  ): Promise<PipelineResult> {
    console.log(`[DocPipeline] Starting pipeline for "${projectName}" (${pages.length} pages)`)

    // Pass 1: Analyze each page with vision
    console.log('[DocPipeline] Pass 1/4: Analyzing pages...')
    const analyses = await this.pass1_analyzePages(pages)

    // Pass 2: Build information architecture
    console.log('[DocPipeline] Pass 2/4: Building information architecture...')
    const architecture = await this.pass2_buildArchitecture(projectName, projectUrl, analyses, navEdges)

    // Pass 3: Generate each section
    console.log('[DocPipeline] Pass 3/4: Generating sections...')
    const sections = await this.pass3_generateSections(architecture, analyses, projectName)

    // Pass 4: Assemble final document
    console.log('[DocPipeline] Pass 4/4: Assembling document...')
    const markdown = this.pass4_assemble(projectName, projectUrl, architecture, sections, analyses)

    console.log(`[DocPipeline] Complete. ${markdown.length} chars, ${architecture.sections.length} sections.`)
    return {
      markdown,
      pageCount: pages.length,
      sectionCount: architecture.sections.length,
    }
  }

  // ── Pass 1: Per-page vision analysis ──────────────────────────

  private async pass1_analyzePages(pages: PipelinePage[]): Promise<PageAnalysis[]> {
    const analyses: PageAnalysis[] = []

    // Process pages in batches of 3 for parallelism
    const BATCH_SIZE = 3
    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(page => this.analyzeSinglePage(page))
      )
      analyses.push(...batchResults)
    }

    return analyses
  }

  private async analyzeSinglePage(page: PipelinePage): Promise<PageAnalysis> {
    const prompt = `You are analyzing a screenshot of a web application page for documentation purposes.

PAGE: "${page.title}" at ${page.url}
HEADINGS ON PAGE: ${page.headings.join(', ') || 'None'}
BUTTONS: ${page.buttons.join(', ') || 'None'}
FORMS: ${page.forms}
LINKS: ${page.links}

Look at the screenshot carefully and answer:

1. PURPOSE: What is this page for? (1 sentence)
2. WHAT_USER_SEES: Describe exactly what's visible on screen — layout, panels, sections, data shown. Be specific. (2-3 sentences)
3. KEY_ELEMENTS: List every important UI element visible (buttons, forms, tabs, filters, tables, cards, etc.)
4. USER_ACTIONS: List every action a user can take on this page (click X, fill Y, navigate to Z, etc.)

Respond in this exact JSON format:
{
  "purpose": "...",
  "whatUserSees": "...",
  "keyElements": ["element1", "element2", ...],
  "userActions": ["action1", "action2", ...]
}`

    try {
      let result: any
      if (page.screenshotPath) {
        result = await this.llm.getClient().analyzeScreenshot(page.screenshotPath, prompt)
      } else {
        const text = await this.llm.getClient().generateText(prompt)
        result = this.parseJson(text)
      }

      return {
        index: page.index,
        url: page.url,
        title: page.title,
        purpose: result.purpose || `${page.title} page`,
        whatUserSees: result.whatUserSees || result.what_user_sees || '',
        keyElements: result.keyElements || result.key_elements || [],
        userActions: result.userActions || result.user_actions || [],
        screenshotPath: page.screenshotPath,
      }
    } catch (error) {
      console.warn(`[DocPipeline] Pass 1 failed for ${page.url}:`, (error as Error).message)
      return {
        index: page.index,
        url: page.url,
        title: page.title,
        purpose: `${page.title} page`,
        whatUserSees: '',
        keyElements: page.buttons.map(b => `"${b}" button`),
        userActions: [],
        screenshotPath: page.screenshotPath,
      }
    }
  }

  // ── Pass 2: Information Architecture ──────────────────────────

  private async pass2_buildArchitecture(
    projectName: string,
    projectUrl: string,
    analyses: PageAnalysis[],
    navEdges: Array<{ from: string; to: string }>,
  ): Promise<DocArchitecture> {
    const pagesSummary = analyses.map(a =>
      `[${a.index}] "${a.title}" (${a.url}) — ${a.purpose}`
    ).join('\n')

    const navSummary = navEdges.slice(0, 40).map(e => `${e.from} → ${e.to}`).join('\n')

    const prompt = `You are an information architect organizing documentation for "${projectName}" (${projectUrl}).

Here are all the pages discovered by crawling:

${pagesSummary}

Navigation flow:
${navSummary}

TASK: Create a logical documentation structure. Group related pages into sections.

Rules:
- Each section should group pages by FUNCTION (e.g., "Communication", "Project Management"), not by URL
- Every page must belong to exactly one section
- Order sections from most important to least important
- Identify which pages are best for a "Getting Started" guide (usually login + main dashboard)
- Write a 1-sentence description of what the entire app does

Respond in this exact JSON format:
{
  "appName": "${projectName}",
  "appDescription": "...",
  "sections": [
    {
      "name": "Section Name",
      "description": "What this section covers",
      "pages": [0, 1, 2]
    }
  ],
  "gettingStartedPages": [0, 1]
}

IMPORTANT: "pages" arrays contain page INDEX numbers (the [N] at the start of each line above).`

    try {
      const result = await this.llm.getClient().generateStructured(prompt, ArchitectureSchema)
      return result as DocArchitecture
    } catch (error) {
      console.warn('[DocPipeline] Pass 2 structured parse failed, trying text:', (error as Error).message)
      try {
        const text = await this.llm.getClient().generateText(prompt)
        const parsed = this.parseJson(text) as DocArchitecture
        return {
          appName: parsed.appName || projectName,
          appDescription: parsed.appDescription || '',
          sections: parsed.sections || [{ name: 'Features', description: 'All features', pages: analyses.map(a => a.index) }],
          gettingStartedPages: parsed.gettingStartedPages || [0],
        }
      } catch {
        // Fallback: single section with all pages
        return {
          appName: projectName,
          appDescription: `${projectName} web application`,
          sections: [{ name: 'Features', description: 'Application features', pages: analyses.map(a => a.index) }],
          gettingStartedPages: [0],
        }
      }
    }
  }

  // ── Pass 3: Section-by-section generation ─────────────────────

  private async pass3_generateSections(
    architecture: DocArchitecture,
    analyses: PageAnalysis[],
    projectName: string,
  ): Promise<Map<string, string>> {
    const sectionDocs = new Map<string, string>()

    for (const section of architecture.sections) {
      const sectionPages = section.pages
        .map(idx => analyses.find(a => a.index === idx))
        .filter(Boolean) as PageAnalysis[]

      if (sectionPages.length === 0) continue

      const doc = await this.generateSection(section, sectionPages, projectName)
      sectionDocs.set(section.name, doc)
    }

    return sectionDocs
  }

  private async generateSection(
    section: DocSection,
    pages: PageAnalysis[],
    projectName: string,
  ): Promise<string> {
    const pagesContext = pages.map(p => {
      const parts = [
        `PAGE: "${p.title}" (${p.url})`,
        `Purpose: ${p.purpose}`,
        `What's on screen: ${p.whatUserSees}`,
        `Key elements: ${p.keyElements.join(', ')}`,
        `User actions: ${p.userActions.join(', ')}`,
      ]
      if (p.screenshotPath) {
        parts.push(`Screenshot: ![${p.title}](./screenshots/${p.index + 1}.png)`)
      }
      return parts.join('\n')
    }).join('\n\n')

    const prompt = `You are a senior technical writer at a top SaaS company writing documentation for "${projectName}".

Write the "${section.name}" section of the user documentation.
Section description: ${section.description}

Here is detailed information about each page in this section:

${pagesContext}

WRITING RULES:
1. Write task-oriented documentation — "How to do X", not "The X page shows Y"
2. Include step-by-step numbered instructions for every major task
3. After each step that changes what's on screen, embed the screenshot using the exact markdown image syntax provided above
4. Describe what the user should see after each action
5. Document every button, filter, tab, and form field that's important
6. Use sub-sections (### headers) to organize by task
7. Keep language clear, concise, professional — no filler
8. If there are multiple related pages, explain how they connect
9. Include tips or notes where helpful using > blockquote syntax
10. Do NOT include the section title — I will add it myself

OUTPUT: Return ONLY the markdown content for this section. No wrapper, no title header.`

    try {
      // Send screenshots for vision if available
      const screenshotPaths = pages
        .filter(p => p.screenshotPath)
        .map(p => p.screenshotPath!)

      let content: string
      if (screenshotPaths.length > 0) {
        content = await this.llm.getClient().generateTextWithImages(prompt, screenshotPaths)
      } else {
        content = await this.llm.getClient().generateText(prompt)
      }

      return content
    } catch (error) {
      console.warn(`[DocPipeline] Pass 3 failed for section "${section.name}":`, (error as Error).message)
      // Fallback: basic structural content
      return pages.map(p =>
        `### ${p.title}\n\n${p.purpose}\n\n**URL:** \`${p.url}\`\n`
      ).join('\n')
    }
  }

  // ── Pass 4: Assembly ──────────────────────────────────────────

  private pass4_assemble(
    projectName: string,
    projectUrl: string,
    architecture: DocArchitecture,
    sectionDocs: Map<string, string>,
    analyses: PageAnalysis[],
  ): string {
    const lines: string[] = []

    // Title
    lines.push(`# ${projectName} — User Documentation`)
    lines.push('')
    lines.push(`> ${architecture.appDescription}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    // Table of Contents
    lines.push('## Table of Contents')
    lines.push('')
    lines.push('- [Getting Started](#getting-started)')
    for (const section of architecture.sections) {
      const anchor = this.slugify(section.name)
      lines.push(`- [${section.name}](#${anchor})`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // Getting Started
    lines.push('## Getting Started')
    lines.push('')
    const gettingStartedPages = architecture.gettingStartedPages
      .map(idx => analyses.find(a => a.index === idx))
      .filter(Boolean) as PageAnalysis[]

    if (gettingStartedPages.length > 0) {
      const firstPage = gettingStartedPages[0]
      lines.push(`To start using ${projectName}:`)
      lines.push('')
      lines.push(`1. Open [${projectUrl}](${projectUrl}) in your browser`)

      for (const page of gettingStartedPages) {
        if (page.purpose.toLowerCase().includes('login') || page.purpose.toLowerCase().includes('auth') || page.purpose.toLowerCase().includes('sign')) {
          lines.push(`2. ${page.purpose}`)
          if (page.userActions.length > 0) {
            for (const action of page.userActions.slice(0, 3)) {
              lines.push(`3. ${action}`)
            }
          }
        }
      }

      lines.push('')
      if (firstPage.screenshotPath) {
        lines.push(`![Getting Started](./screenshots/${firstPage.index + 1}.png)`)
        lines.push('')
      }
    } else {
      lines.push(`Navigate to [${projectUrl}](${projectUrl}) to get started.`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')

    // Each section
    for (const section of architecture.sections) {
      lines.push(`## ${section.name}`)
      lines.push('')

      const doc = sectionDocs.get(section.name)
      if (doc) {
        lines.push(doc)
      } else {
        lines.push(`*${section.description}*`)
      }

      lines.push('')
      lines.push('---')
      lines.push('')
    }

    // Footer
    lines.push(`*Documentation generated by Floww for [${projectName}](${projectUrl})*`)

    return lines.join('\n')
  }

  // ── Helpers ───────────────────────────────────────────────────

  private parseJson(text: string): any {
    try {
      // Find JSON in the response
      const startIdx = text.indexOf('{')
      const endIdx = text.lastIndexOf('}')
      if (startIdx === -1 || endIdx === -1) return {}
      return JSON.parse(text.slice(startIdx, endIdx + 1))
    } catch {
      return {}
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }
}

// Zod-like schema for structured output (used as hint, not strict validation)
import { z } from 'zod'

const ArchitectureSchema = z.object({
  appName: z.string(),
  appDescription: z.string(),
  sections: z.array(z.object({
    name: z.string(),
    description: z.string(),
    pages: z.array(z.number()),
  })),
  gettingStartedPages: z.array(z.number()),
})
