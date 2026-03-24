/**
 * DOM Indexer
 *
 * Assigns numeric indices to interactive page elements and produces a compact
 * text representation for LLM consumption. Merges DOM attributes, accessibility
 * tree data, and visibility information into EnrichedElement objects.
 *
 * Inspired by browser-use's indexed element mapping pattern:
 *   [1]<button role="submit">Sign Up</button>
 *   [2]<input type="email" placeholder="Enter email"/>
 *   [3]<a href="/about">About Us</a>
 */

import type { Page } from 'playwright'
import type { EnrichedElement, IndexedDOM } from '../types'
import { getCDPSession } from './cdp-session'
import { fetchAccessibilityTree, buildAXNodeMap } from './accessibility-tree'
import { checkVisibility } from './visibility-filter'

export interface IndexerOptions {
  includeNonInteractive?: boolean
  maxElements?: number
  filterOccluded?: boolean
  maxTextLength?: number
}

const DEFAULTS: Required<IndexerOptions> = {
  includeNonInteractive: false,
  maxElements: 500,
  filterOccluded: true,
  maxTextLength: 100,
}

const INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'input', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="slider"]',
  '[role="combobox"]', '[role="searchbox"]', '[role="textbox"]',
  '[contenteditable="true"]', '[contenteditable=""]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Raw element data collected from a single page.evaluate call */
interface RawElement {
  tagName: string
  innerText: string
  attributes: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
  selector: string
  isInteractive: boolean
}

/**
 * Index all interactive elements on the page, merge with accessibility tree
 * data and visibility information, and produce a compact text representation.
 */
export async function indexPageElements(
  page: Page,
  options?: IndexerOptions,
): Promise<IndexedDOM> {
  const opts = { ...DEFAULTS, ...options }

  // Step 1: Collect raw DOM elements + resolve backend node IDs in parallel with AX tree
  const [rawElements, axNodes] = await Promise.all([
    collectRawElements(page, opts),
    fetchAccessibilityTree(page),
  ])

  const axMap = buildAXNodeMap(axNodes)

  // Step 2: Resolve backend node IDs via CDP
  const cdp = await getCDPSession(page)
  const elementsWithNodeIds = await resolveBackendNodeIds(cdp, page, rawElements)

  // Step 3: Check visibility
  const visibilityMap = await checkVisibility(
    page,
    elementsWithNodeIds.map(e => ({ backendNodeId: e.backendNodeId, selector: e.selector })),
    opts.filterOccluded,
  )

  // Step 4: Build enriched elements (assign indices to visible elements only)
  const enrichedElements: EnrichedElement[] = []
  let index = 1

  for (const raw of elementsWithNodeIds) {
    if (enrichedElements.length >= opts.maxElements) break

    const visibility = visibilityMap.get(raw.backendNodeId)
    const isVisible = visibility?.isVisible ?? true

    if (!isVisible && !opts.includeNonInteractive) continue
    if (!raw.isInteractive && !opts.includeNonInteractive) continue

    const ax = axMap.get(raw.backendNodeId)

    const enriched: EnrichedElement = {
      index,
      tagName: raw.tagName,
      role: ax?.role ?? '',
      name: ax?.name ?? '',
      description: ax?.description ?? '',
      states: ax?.states ?? [],
      boundingBox: raw.rect.width > 0 ? raw.rect : null,
      isVisible,
      isInteractive: raw.isInteractive,
      selector: raw.selector,
      backendNodeId: raw.backendNodeId,
      attributes: raw.attributes,
      innerText: truncate(raw.innerText, opts.maxTextLength),
      children: [],
    }

    enrichedElements.push(enriched)
    index++
  }

  const textRepresentation = serializeIndexedDOM(enrichedElements)

  return {
    elements: enrichedElements,
    textRepresentation,
    stats: {
      totalElements: rawElements.length,
      interactiveElements: rawElements.filter(e => e.isInteractive).length,
      visibleElements: enrichedElements.filter(e => e.isVisible).length,
      filteredElements: rawElements.length - enrichedElements.length,
    },
  }
}

/**
 * Serialize indexed elements into a compact text representation for LLM consumption.
 */
export function serializeIndexedDOM(elements: EnrichedElement[]): string {
  const lines: string[] = []

  for (const el of elements) {
    if (!el.isVisible) continue

    const tag = el.tagName.toLowerCase()
    const attrs = formatAttributes(el)
    const content = el.innerText.trim()

    if (isVoidElement(tag)) {
      lines.push(`[${el.index}]<${tag}${attrs}/>`)
    } else if (content) {
      lines.push(`[${el.index}]<${tag}${attrs}>${content}</${tag}>`)
    } else {
      lines.push(`[${el.index}]<${tag}${attrs}/>`)
    }
  }

  return lines.join('\n')
}

// ── Internal helpers ────────────────────────────────────────────

async function collectRawElements(page: Page, opts: Required<IndexerOptions>): Promise<RawElement[]> {
  const selector = opts.includeNonInteractive
    ? 'button, a, input, select, textarea, [role], label, h1, h2, h3, h4, p, span, div, li, td, th'
    : INTERACTIVE_SELECTOR

  return page.evaluate(
    ({ sel, maxElements, maxTextLength }) => {
      const elements = Array.from(document.querySelectorAll(sel)).slice(0, maxElements * 2)
      const results: any[] = []

      for (const el of elements) {
        if (results.length >= maxElements) break

        const rect = el.getBoundingClientRect()
        const htmlEl = el as HTMLElement

        // Build a unique selector for re-targeting
        let cssSelector = ''
        if (el.id) {
          cssSelector = `#${CSS.escape(el.id)}`
        } else {
          const tag = el.tagName.toLowerCase()
          const parent = el.parentElement
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName)
            if (siblings.length === 1) {
              cssSelector = `${parent.id ? '#' + CSS.escape(parent.id) + ' > ' : ''}${tag}`
            } else {
              const idx = siblings.indexOf(el) + 1
              cssSelector = `${tag}:nth-of-type(${idx})`
            }
          } else {
            cssSelector = tag
          }
        }

        // Collect relevant attributes
        const attrs: Record<string, string> = {}
        const attrNames = ['type', 'name', 'placeholder', 'href', 'role', 'aria-label',
          'aria-describedby', 'value', 'title', 'alt', 'for', 'action', 'method']
        for (const name of attrNames) {
          const val = el.getAttribute(name)
          if (val) attrs[name] = val
        }

        const interactiveTagNames = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'])
        const interactiveRoles = new Set([
          'button', 'link', 'tab', 'menuitem', 'checkbox', 'radio',
          'switch', 'slider', 'combobox', 'searchbox', 'textbox',
        ])
        const isInteractive = interactiveTagNames.has(el.tagName) ||
          interactiveRoles.has(el.getAttribute('role') || '') ||
          el.hasAttribute('contenteditable') ||
          (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')

        results.push({
          tagName: el.tagName,
          innerText: (htmlEl.innerText || '').slice(0, maxTextLength),
          attributes: attrs,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          selector: cssSelector,
          isInteractive,
        })
      }

      return results
    },
    { sel: selector, maxElements: opts.maxElements, maxTextLength: opts.maxTextLength },
  )
}

async function resolveBackendNodeIds(
  cdp: any,
  page: Page,
  elements: RawElement[],
): Promise<(RawElement & { backendNodeId: number })[]> {
  if (page.isClosed()) return elements.map((el, i) => ({ ...el, backendNodeId: -(i + 1) }))
  // Use DOM.getDocument + DOM.querySelector to resolve selectors to backend node IDs
  const results: (RawElement & { backendNodeId: number })[] = []

  let rootNodeId: number
  try {
    const doc = await cdp.send('DOM.getDocument', { depth: 0 })
    rootNodeId = doc.root.nodeId
  } catch {
    // Fallback: assign synthetic IDs so the rest of the pipeline still works
    return elements.map((el, i) => ({ ...el, backendNodeId: -(i + 1) }))
  }

  for (const el of elements) {
    try {
      const result = await cdp.send('DOM.querySelector', {
        nodeId: rootNodeId,
        selector: el.selector,
      })
      if (result?.nodeId) {
        const described = await cdp.send('DOM.describeNode', { nodeId: result.nodeId })
        results.push({ ...el, backendNodeId: described.node.backendNodeId })
      } else {
        results.push({ ...el, backendNodeId: -(results.length + 1) })
      }
    } catch {
      results.push({ ...el, backendNodeId: -(results.length + 1) })
    }
  }

  return results
}

function formatAttributes(el: EnrichedElement): string {
  const parts: string[] = []

  // Include role if not obvious from tag
  if (el.role && !['button', 'link', 'textbox'].includes(el.role)) {
    parts.push(`role="${el.role}"`)
  }

  // Include key attributes
  const include = ['type', 'name', 'placeholder', 'href', 'aria-label', 'value', 'title', 'alt']
  for (const attr of include) {
    const val = el.attributes[attr]
    if (val) {
      // Truncate long attribute values
      parts.push(`${attr}="${val.length > 60 ? val.slice(0, 57) + '...' : val}"`)
    }
  }

  // Include states
  if (el.states.length > 0) {
    parts.push(`states="${el.states.join(',')}"`)
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : ''
}

function isVoidElement(tag: string): boolean {
  return ['input', 'img', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'].includes(tag)
}

function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + '...' : cleaned
}
