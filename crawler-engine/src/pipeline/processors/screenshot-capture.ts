import type { IContentProcessor, ProcessorContext } from '../processor-interface'

export class ScreenshotProcessor implements IContentProcessor {
  name = 'screenshot'

  async process(context: ProcessorContext): Promise<ProcessorContext> {
    try {
      context.screenshot = await context.page.screenshot({
        fullPage: true,
        timeout: 15000,
      })
    } catch {
      try {
        // Fallback: viewport only
        context.screenshot = await context.page.screenshot({
          fullPage: false,
          timeout: 10000,
        })
      } catch {
        context.screenshot = Buffer.from([])
      }
    }
    return context
  }
}
