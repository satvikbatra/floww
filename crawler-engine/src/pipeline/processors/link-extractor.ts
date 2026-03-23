import type { IContentProcessor, ProcessorContext } from '../processor-interface'

export class LinkExtractorProcessor implements IContentProcessor {
  name = 'link-extractor'

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    // Links are already extracted in pageData.links
    // Filter out obviously non-page links
    context.links = context.pageData.links.filter(link => {
      const href = link.href.toLowerCase()
      // Skip file downloads
      if (/\.(pdf|zip|tar|gz|exe|dmg|pkg|deb|rpm|iso|img|mp3|mp4|avi|mkv|mov|wav|jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot)$/i.test(href)) {
        return false
      }
      return true
    })

    return context
  }
}
