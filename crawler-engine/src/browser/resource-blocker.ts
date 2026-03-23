/**
 * Resource Blocker — Blocks unnecessary resources to speed up crawling
 *
 * Blocks: fonts, images (optional), videos, tracking scripts, ads
 * Keeps: HTML, CSS (needed for layout), essential JS
 */

import type { BrowserContext } from 'playwright'

export interface ResourceBlockConfig {
  blockImages: boolean
  blockFonts: boolean
  blockMedia: boolean
  blockTrackers: boolean
  blockAds: boolean
}

const DEFAULT_CONFIG: ResourceBlockConfig = {
  blockImages: false,   // Keep images for screenshots
  blockFonts: true,     // Fonts are heavy, not needed for crawling
  blockMedia: true,     // Videos, audio
  blockTrackers: true,  // Analytics, tracking pixels
  blockAds: true,       // Ad scripts
}

// Known tracker/ad domains
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'facebook.com/tr',
  'doubleclick.net',
  'googlesyndication.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
  'heapanalytics.com',
  'intercom.io',
  'crisp.chat',
  'tawk.to',
  'drift.com',
  'optimizely.com',
  'fullstory.com',
  'mouseflow.com',
  'clarity.ms',
  'sentry.io',
  'bugsnag.com',
  'logrocket.com',
]

const BLOCKED_EXTENSIONS = [
  '.woff', '.woff2', '.ttf', '.eot', '.otf', // fonts
  '.mp4', '.webm', '.ogg', '.avi', '.mov',   // video
  '.mp3', '.wav', '.flac', '.aac',            // audio
  '.gif',                                      // animated GIFs (heavy)
]

/**
 * Install resource blocking on a browser context.
 * Call this BEFORE navigating to any pages.
 */
export async function installResourceBlocker(
  context: BrowserContext,
  config?: Partial<ResourceBlockConfig>
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  await context.route('**/*', (route) => {
    const url = route.request().url()
    const resourceType = route.request().resourceType()

    // Block by resource type
    if (cfg.blockFonts && resourceType === 'font') {
      return route.abort()
    }
    if (cfg.blockImages && resourceType === 'image') {
      return route.abort()
    }
    if (cfg.blockMedia && (resourceType === 'media' || resourceType === 'websocket')) {
      return route.abort()
    }

    // Block by extension
    const urlLower = url.toLowerCase()
    for (const ext of BLOCKED_EXTENSIONS) {
      if (urlLower.includes(ext)) {
        if (ext.startsWith('.woff') || ext.startsWith('.ttf') || ext.startsWith('.eot') || ext.startsWith('.otf')) {
          if (cfg.blockFonts) return route.abort()
        }
        if (ext.startsWith('.mp') || ext.startsWith('.web') || ext.startsWith('.ogg') || ext.startsWith('.avi') || ext.startsWith('.mov') || ext.startsWith('.wav') || ext.startsWith('.flac') || ext.startsWith('.aac')) {
          if (cfg.blockMedia) return route.abort()
        }
        if (ext === '.gif' && cfg.blockMedia) {
          return route.abort()
        }
      }
    }

    // Block by domain (trackers, ads)
    if (cfg.blockTrackers || cfg.blockAds) {
      for (const domain of BLOCKED_DOMAINS) {
        if (url.includes(domain)) {
          return route.abort()
        }
      }
    }

    // Allow everything else
    return route.continue()
  })
}
