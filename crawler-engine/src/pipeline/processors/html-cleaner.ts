import * as cheerio from 'cheerio'
import type { IContentProcessor, ProcessorContext } from '../processor-interface'

export class HtmlCleanerProcessor implements IContentProcessor {
  name = 'html-cleaner'

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    const $ = cheerio.load(context.pageData.html)

    // Remove noise elements
    $('script, style, noscript, iframe, svg, nav, footer, header').remove()
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove()
    $('[class*="cookie"], [class*="popup"], [class*="modal"], [class*="overlay"]').remove()
    $('[class*="sidebar"], [class*="menu"], [class*="nav"]').remove()
    $('[id*="cookie"], [id*="popup"], [id*="modal"]').remove()

    context.metadata.cleanedHtml = $.html()
    return context
  }
}
