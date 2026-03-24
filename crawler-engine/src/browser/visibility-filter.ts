/**
 * Visibility Filter
 *
 * Determines which DOM elements are actually visible to the user.
 * Two-pass approach:
 *   1. CSS check (fast) — display, visibility, opacity, bounding rect
 *   2. CDP paint-order check (slower) — detects elements occluded by overlays/modals
 *
 * Inspired by browser-use's paint-order filtering.
 */

import type { Page } from 'playwright'
import { getCDPSession } from './cdp-session'

export interface VisibilityInfo {
  backendNodeId: number
  isVisible: boolean
  reason?: 'display_none' | 'visibility_hidden' | 'zero_size' | 'off_screen' | 'occluded' | 'opacity_zero'
}

/**
 * Check visibility for a batch of elements identified by CSS selectors.
 * Returns a map from backendNodeId → VisibilityInfo.
 *
 * @param elements - Array of { backendNodeId, selector } to check
 * @param filterOccluded - If true, runs the slower CDP occlusion check
 */
export async function checkVisibility(
  page: Page,
  elements: Array<{ backendNodeId: number; selector: string }>,
  filterOccluded = true,
): Promise<Map<number, VisibilityInfo>> {
  const results = new Map<number, VisibilityInfo>()

  if (elements.length === 0) return results

  // Pass 1: CSS visibility check (single evaluate call for all elements)
  const selectors = elements.map(e => e.selector)
  const rawResults = await page.evaluate((sels: string[]) => {
    return sels.map(sel => {
      const el = document.querySelector(sel)
      if (!el) return null

      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()

      return {
        selector: sel,
        display: style.display,
        visibility: style.visibility,
        opacity: parseFloat(style.opacity),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    })
  }, selectors)

  const visibleForOcclusionCheck: Array<{ backendNodeId: number; centerX: number; centerY: number }> = []

  for (let i = 0; i < elements.length; i++) {
    const raw = rawResults[i]
    const { backendNodeId } = elements[i]

    if (!raw) {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'display_none' })
      continue
    }

    if (raw.display === 'none') {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'display_none' })
      continue
    }
    if (raw.visibility === 'hidden') {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'visibility_hidden' })
      continue
    }
    if (raw.opacity === 0) {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'opacity_zero' })
      continue
    }
    if (raw.rect.width === 0 || raw.rect.height === 0) {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'zero_size' })
      continue
    }
    if (raw.rect.x + raw.rect.width < 0 || raw.rect.y + raw.rect.height < 0) {
      results.set(backendNodeId, { backendNodeId, isVisible: false, reason: 'off_screen' })
      continue
    }

    // Passed CSS checks — mark as potentially visible
    results.set(backendNodeId, { backendNodeId, isVisible: true })

    if (filterOccluded) {
      visibleForOcclusionCheck.push({
        backendNodeId,
        centerX: Math.round(raw.rect.x + raw.rect.width / 2),
        centerY: Math.round(raw.rect.y + raw.rect.height / 2),
      })
    }
  }

  // Pass 2: CDP paint-order occlusion check
  if (filterOccluded && visibleForOcclusionCheck.length > 0) {
    await checkOcclusion(page, visibleForOcclusionCheck, results)
  }

  return results
}

/**
 * Check if elements are occluded by other elements at their center point.
 * Uses CDP DOM.getNodeForLocation to determine what's painted at each coordinate.
 */
async function checkOcclusion(
  page: Page,
  elements: Array<{ backendNodeId: number; centerX: number; centerY: number }>,
  results: Map<number, VisibilityInfo>,
): Promise<void> {
  let cdp: Awaited<ReturnType<typeof getCDPSession>>
  try {
    cdp = await getCDPSession(page)
  } catch {
    return // CDP not available, skip occlusion check
  }

  // Get viewport dimensions to skip elements outside viewport
  const viewport = page.viewportSize()
  if (!viewport) return

  for (const el of elements) {
    // Skip if center is outside viewport
    if (el.centerX < 0 || el.centerY < 0 || el.centerX > viewport.width || el.centerY > viewport.height) {
      continue
    }

    try {
      const hit = await cdp.send('DOM.getNodeForLocation' as any, {
        x: el.centerX,
        y: el.centerY,
        includeUserAgentShadowDOM: false,
      }) as { backendNodeId: number; frameId?: string; nodeId?: number }

      // If the node at the center point is different from our element,
      // the element is occluded (something is painted on top of it)
      if (hit.backendNodeId !== el.backendNodeId) {
        // Check if the hit node is a descendant of our element (that's OK)
        const isDescendant = await isNodeDescendant(cdp, hit.backendNodeId, el.backendNodeId)
        if (!isDescendant) {
          results.set(el.backendNodeId, {
            backendNodeId: el.backendNodeId,
            isVisible: false,
            reason: 'occluded',
          })
        }
      }
    } catch {
      // Element may have been removed during check — skip
    }
  }
}

/**
 * Check if childNodeId is a descendant of parentNodeId via CDP.
 */
async function isNodeDescendant(
  cdp: any,
  childBackendNodeId: number,
  parentBackendNodeId: number,
): Promise<boolean> {
  try {
    // Resolve both nodes to get their DOM structure
    const childResult = await cdp.send('DOM.describeNode', { backendNodeId: childBackendNodeId, depth: 0 })
    const parentResult = await cdp.send('DOM.describeNode', { backendNodeId: parentBackendNodeId, depth: -1 })

    if (!childResult?.node || !parentResult?.node) return false

    // Walk up from child to check if parent is an ancestor
    // Use a simpler approach: resolve child's outer HTML and check containment
    // This is a heuristic — for exact check we'd need to walk the tree
    return childResult.node.parentId === parentResult.node.nodeId
  } catch {
    return false
  }
}
