import type { IContentProcessor, ProcessorContext } from '../processor-interface'

export class MetadataProcessor implements IContentProcessor {
  name = 'metadata'

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    // Metadata is already extracted in pageData.meta and pageData.headings
    // Enrich with additional structured data
    context.metadata = {
      ...context.metadata,
      title: context.pageData.title,
      url: context.pageData.url,
      httpStatus: context.pageData.httpStatus,
      isSPA: context.pageData.isSPA,
      headingCount: context.pageData.headings.length,
      formCount: context.pageData.forms.length,
      buttonCount: context.pageData.buttons.length,
      linkCount: context.pageData.links.length,
    }

    return context
  }
}
