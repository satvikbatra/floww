import { describe, it, expect } from 'vitest'
import { CrawlerConfigSchema } from '../config'

describe('CrawlerConfigSchema', () => {
  it('applies defaults', () => {
    const config = CrawlerConfigSchema.parse({})

    expect(config.maxPages).toBe(100)
    expect(config.maxDepth).toBe(5)
    expect(config.delayMs).toBe(1000)
    expect(config.strategy).toBe('same_domain')
    expect(config.headless).toBe(true)
    expect(config.useStealth).toBe(true)
    expect(config.maxBrowsers).toBe(1)
    expect(config.processors).toEqual(['link-extractor', 'metadata', 'screenshot'])
    expect(config.enableEnrichedDOM).toBe(false)
    expect(config.enableWatchdogs).toBe(false)
  })

  it('accepts valid overrides', () => {
    const config = CrawlerConfigSchema.parse({
      maxPages: 50,
      maxDepth: 3,
      strategy: 'depth_only',
      enableEnrichedDOM: true,
      enableWatchdogs: true,
      watchdogs: ['popup', 'dom-change'],
    })

    expect(config.maxPages).toBe(50)
    expect(config.maxDepth).toBe(3)
    expect(config.strategy).toBe('depth_only')
    expect(config.enableEnrichedDOM).toBe(true)
    expect(config.enableWatchdogs).toBe(true)
    expect(config.watchdogs).toEqual(['popup', 'dom-change'])
  })

  it('rejects invalid values', () => {
    expect(() => CrawlerConfigSchema.parse({ maxPages: -1 })).toThrow()
    expect(() => CrawlerConfigSchema.parse({ strategy: 'invalid' })).toThrow()
    expect(() => CrawlerConfigSchema.parse({ contentSimilarityThreshold: 2 })).toThrow()
  })

  it('validates enrichedDOMOptions defaults', () => {
    const config = CrawlerConfigSchema.parse({ enableEnrichedDOM: true })

    expect(config.enrichedDOMOptions.maxElements).toBe(500)
    expect(config.enrichedDOMOptions.filterOccluded).toBe(true)
    expect(config.enrichedDOMOptions.maxTextLength).toBe(100)
    expect(config.enrichedDOMOptions.includeNonInteractive).toBe(false)
  })
})
