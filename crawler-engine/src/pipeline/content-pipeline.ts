import type { Page } from 'playwright'
import type { PageData } from '../types'
import type { IContentProcessor, ProcessorContext } from './processor-interface'

export class ContentPipeline {
  private processors: IContentProcessor[] = []

  addProcessor(processor: IContentProcessor): void {
    this.processors.push(processor)
  }

  /**
   * Run all processors sequentially on the page data
   */
  async run(page: Page, pageData: PageData): Promise<ProcessorContext> {
    let context: ProcessorContext = {
      page,
      pageData,
      metadata: { ...pageData.meta },
      links: [...pageData.links],
    }

    for (const processor of this.processors) {
      try {
        context = await processor.process(context)
      } catch (error) {
        console.warn(`Processor "${processor.name}" failed:`, error)
        // Continue with next processor — don't let one failure break the pipeline
      }
    }

    return context
  }

  get processorNames(): string[] {
    return this.processors.map(p => p.name)
  }
}
