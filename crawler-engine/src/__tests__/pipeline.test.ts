import { describe, it, expect } from 'vitest'
import { ContentPipeline } from '../pipeline/content-pipeline'
import { HtmlCleanerProcessor } from '../pipeline/processors/html-cleaner'
import { MarkdownProcessor } from '../pipeline/processors/markdown-converter'
import { LinkExtractorProcessor } from '../pipeline/processors/link-extractor'
import { MetadataProcessor } from '../pipeline/processors/metadata-extractor'
import type { IContentProcessor, ProcessorContext } from '../pipeline/processor-interface'
import type { PageData } from '../types'

const mockPage = {} as any // Page mock — processors don't need real page for unit tests

function makePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/page',
    finalUrl: 'https://example.com/page',
    title: 'Test Page',
    html: '<html><body><h1>Hello</h1><p>World</p></body></html>',
    httpStatus: 200,
    loadTimeMs: 100,
    links: [
      { href: 'https://example.com/about', text: 'About' },
      { href: 'https://example.com/file.pdf', text: 'Download' },
    ],
    forms: [],
    buttons: [],
    meta: { description: 'A test page' },
    headings: [{ level: 1, text: 'Hello' }],
    isSPA: false,
    ...overrides,
  }
}

describe('ContentPipeline', () => {
  it('runs processors in order', async () => {
    const pipeline = new ContentPipeline()
    const order: string[] = []

    const makeProcessor = (name: string): IContentProcessor => ({
      name,
      async process(ctx) {
        order.push(name)
        return ctx
      },
    })

    pipeline.addProcessor(makeProcessor('first'))
    pipeline.addProcessor(makeProcessor('second'))
    pipeline.addProcessor(makeProcessor('third'))

    await pipeline.run(mockPage, makePageData())
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('continues when a processor fails', async () => {
    const pipeline = new ContentPipeline()
    const reached = { second: false }

    pipeline.addProcessor({
      name: 'failing',
      async process() { throw new Error('boom') },
    })
    pipeline.addProcessor({
      name: 'survivor',
      async process(ctx) { reached.second = true; return ctx },
    })

    await pipeline.run(mockPage, makePageData())
    expect(reached.second).toBe(true)
  })

  it('threads context through processors', async () => {
    const pipeline = new ContentPipeline()

    pipeline.addProcessor({
      name: 'annotator',
      async process(ctx) {
        ctx.metadata.custom = 'value'
        return ctx
      },
    })

    const result = await pipeline.run(mockPage, makePageData())
    expect(result.metadata.custom).toBe('value')
  })

  it('reports processor names', () => {
    const pipeline = new ContentPipeline()
    pipeline.addProcessor({ name: 'a', process: async (c) => c })
    pipeline.addProcessor({ name: 'b', process: async (c) => c })
    expect(pipeline.processorNames).toEqual(['a', 'b'])
  })
})

describe('LinkExtractorProcessor', () => {
  const processor = new LinkExtractorProcessor()

  it('filters out file download links', async () => {
    const ctx: ProcessorContext = {
      page: mockPage,
      pageData: makePageData({
        links: [
          { href: 'https://example.com/about', text: 'About' },
          { href: 'https://example.com/file.pdf', text: 'PDF' },
          { href: 'https://example.com/app.exe', text: 'EXE' },
          { href: 'https://example.com/image.jpg', text: 'Image' },
          { href: 'https://example.com/docs', text: 'Docs' },
        ],
      }),
      metadata: {},
      links: [],
    }
    // Copy links from pageData to context.links (as pipeline.run does)
    ctx.links = [...ctx.pageData.links]

    const result = await processor.process(ctx)
    const hrefs = result.links.map(l => l.href)

    expect(hrefs).toContain('https://example.com/about')
    expect(hrefs).toContain('https://example.com/docs')
    expect(hrefs).not.toContain('https://example.com/file.pdf')
    expect(hrefs).not.toContain('https://example.com/app.exe')
    expect(hrefs).not.toContain('https://example.com/image.jpg')
  })
})

describe('MetadataProcessor', () => {
  const processor = new MetadataProcessor()

  it('enriches metadata from pageData', async () => {
    const pageData = makePageData({
      title: 'My Page',
      httpStatus: 200,
      isSPA: true,
      headings: [{ level: 1, text: 'H1' }, { level: 2, text: 'H2' }],
      forms: [{ action: '/submit', method: 'POST', inputs: [] }],
      buttons: [{ text: 'Submit', type: 'submit' }],
      links: [{ href: '/a', text: 'A' }, { href: '/b', text: 'B' }],
    })

    const ctx: ProcessorContext = {
      page: mockPage,
      pageData,
      metadata: {},
      links: pageData.links,
    }

    const result = await processor.process(ctx)
    expect(result.metadata.title).toBe('My Page')
    expect(result.metadata.isSPA).toBe(true)
    expect(result.metadata.headingCount).toBe(2)
    expect(result.metadata.formCount).toBe(1)
    expect(result.metadata.buttonCount).toBe(1)
    expect(result.metadata.linkCount).toBe(2)
  })
})

describe('HtmlCleanerProcessor', () => {
  const processor = new HtmlCleanerProcessor()

  it('removes script and style tags', async () => {
    const ctx: ProcessorContext = {
      page: mockPage,
      pageData: makePageData({
        html: '<html><head><script>alert(1)</script><style>.x{}</style></head><body><p>Content</p></body></html>',
      }),
      metadata: {},
      links: [],
    }

    const result = await processor.process(ctx)
    const cleaned = result.metadata.cleanedHtml as string
    expect(cleaned).not.toContain('<script>')
    expect(cleaned).not.toContain('<style>')
    expect(cleaned).toContain('Content')
  })
})

describe('MarkdownProcessor', () => {
  const processor = new MarkdownProcessor()

  it('converts HTML headings to markdown', async () => {
    const ctx: ProcessorContext = {
      page: mockPage,
      pageData: makePageData({
        html: '<html><body><h1>Title</h1><h2>Subtitle</h2><p>Paragraph text here.</p></body></html>',
      }),
      metadata: {},
      links: [],
    }

    const result = await processor.process(ctx)
    expect(result.markdown).toContain('# Title')
    expect(result.markdown).toContain('## Subtitle')
    expect(result.markdown).toContain('Paragraph text here.')
  })

  it('converts links to markdown format', async () => {
    const ctx: ProcessorContext = {
      page: mockPage,
      pageData: makePageData({
        html: '<html><body><a href="/about">About Us</a></body></html>',
      }),
      metadata: {},
      links: [],
    }

    const result = await processor.process(ctx)
    expect(result.markdown).toContain('[About Us](/about)')
  })
})
