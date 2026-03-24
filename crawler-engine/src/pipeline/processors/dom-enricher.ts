/**
 * DOM Enricher Pipeline Processor
 *
 * Orchestrates CDP-based accessibility tree extraction, element indexing,
 * and visibility filtering to produce an enriched DOM representation.
 *
 * Attaches results to ProcessorContext:
 *   - context.enrichedDOM — compact text for LLM consumption
 *   - context.enrichedDOMElements — structured element data
 *   - context.metadata.enrichedDOMStats — indexing statistics
 */

import type { IContentProcessor, ProcessorContext } from '../processor-interface'
import { indexPageElements, type IndexerOptions } from '../../browser/dom-indexer'

export class DOMEnricherProcessor implements IContentProcessor {
  name = 'dom-enricher'
  private options: IndexerOptions

  constructor(options?: Partial<IndexerOptions>) {
    this.options = {
      includeNonInteractive: options?.includeNonInteractive ?? false,
      maxElements: options?.maxElements ?? 500,
      filterOccluded: options?.filterOccluded ?? true,
      maxTextLength: options?.maxTextLength ?? 100,
    }
  }

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    try {
      const indexed = await indexPageElements(context.page, this.options)

      context.enrichedDOM = indexed.textRepresentation
      context.enrichedDOMElements = indexed.elements
      context.metadata.enrichedDOMStats = indexed.stats
    } catch (err) {
      // Enriched DOM is optional — don't fail the pipeline
      context.metadata.enrichedDOMError = err instanceof Error ? err.message : 'Unknown error'
    }

    return context
  }
}
