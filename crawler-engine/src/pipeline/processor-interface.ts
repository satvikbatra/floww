import type { Page } from 'playwright'
import type { PageData, EnrichedElement } from '../types'

export interface ProcessorContext {
  page: Page
  pageData: PageData
  screenshot?: Buffer
  markdown?: string
  metadata: Record<string, any>
  links: Array<{ href: string; text: string }>
  enrichedDOM?: string
  enrichedDOMElements?: EnrichedElement[]
}

export interface IContentProcessor {
  name: string
  process(context: ProcessorContext): Promise<ProcessorContext>
}
