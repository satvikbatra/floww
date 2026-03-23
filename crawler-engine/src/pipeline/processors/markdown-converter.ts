import * as cheerio from 'cheerio'
import type { IContentProcessor, ProcessorContext } from '../processor-interface'

/**
 * Converts cleaned HTML to markdown. Uses cheerio for simple conversion.
 */
export class MarkdownProcessor implements IContentProcessor {
  name = 'markdown'

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    const html = context.metadata.cleanedHtml || context.pageData.html
    const $ = cheerio.load(html)

    // Remove scripts/styles if not already cleaned
    $('script, style, noscript').remove()

    const lines: string[] = []

    // Process headings, paragraphs, lists, tables
    $('body *').each((_, el) => {
      const $el = $(el)
      const tag = el.tagName?.toLowerCase()
      const text = $el.clone().children().remove().end().text().trim()

      switch (tag) {
        case 'h1': if (text) lines.push(`# ${text}\n`); break
        case 'h2': if (text) lines.push(`## ${text}\n`); break
        case 'h3': if (text) lines.push(`### ${text}\n`); break
        case 'h4': if (text) lines.push(`#### ${text}\n`); break
        case 'p': if (text && text.length > 10) lines.push(`${text}\n`); break
        case 'li': if (text) lines.push(`- ${text}`); break
        case 'a': {
          const href = $el.attr('href')
          if (href && text) lines.push(`[${text}](${href})`)
          break
        }
        case 'code':
        case 'pre': if (text) lines.push(`\`\`\`\n${text}\n\`\`\`\n`); break
        case 'blockquote': if (text) lines.push(`> ${text}\n`); break
      }
    })

    // Deduplicate consecutive empty lines
    context.markdown = lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return context
  }
}
