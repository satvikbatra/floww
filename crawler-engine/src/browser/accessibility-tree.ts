/**
 * Accessibility Tree Extraction via CDP
 *
 * Fetches the full accessibility (AX) tree from Chrome and builds a lookup map
 * keyed by backend DOM node ID. This allows merging semantic info (roles, names,
 * states) with DOM elements for richer page understanding.
 *
 * Inspired by browser-use's approach to dual DOM + AX tree merging.
 */

import type { Page } from 'playwright'
import type { AXNodeInfo } from '../types'
import { getCDPSession } from './cdp-session'

/** CDP AX tree node shape (subset of fields we use) */
interface CDPAXNode {
  nodeId: string
  role: { type: string; value: string }
  name?: { type: string; value: string }
  description?: { type: string; value: string }
  value?: { type: string; value: string }
  properties?: Array<{ name: string; value: { type: string; value: any } }>
  backendDOMNodeId?: number
  childIds?: string[]
  ignored?: boolean
}

const AX_STATE_PROPERTIES = new Set([
  'focused', 'disabled', 'expanded', 'checked', 'selected', 'pressed',
  'readonly', 'required', 'invalid', 'busy', 'modal', 'hidden',
])

/**
 * Fetch the full accessibility tree for a page via CDP.
 * Returns parsed AXNodeInfo entries (only non-ignored nodes with a DOM mapping).
 *
 * Times out after 5 seconds and returns an empty array on failure.
 */
export async function fetchAccessibilityTree(page: Page): Promise<AXNodeInfo[]> {
  const cdp = await getCDPSession(page)

  let rawNodes: CDPAXNode[]
  try {
    const result = await Promise.race([
      cdp.send('Accessibility.getFullAXTree' as any),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AX tree fetch timed out')), 5000)
      ),
    ]) as { nodes: CDPAXNode[] }
    rawNodes = result.nodes
  } catch {
    return []
  }

  const nodes: AXNodeInfo[] = []

  for (const raw of rawNodes) {
    if (raw.ignored || !raw.backendDOMNodeId) continue

    const role = raw.role?.value ?? ''
    if (role === 'none' || role === 'GenericContainer') continue

    const states: string[] = []
    if (raw.properties) {
      for (const prop of raw.properties) {
        if (AX_STATE_PROPERTIES.has(prop.name) && prop.value?.value === true) {
          states.push(prop.name)
        }
      }
    }

    nodes.push({
      role,
      name: raw.name?.value ?? '',
      description: raw.description?.value ?? '',
      states,
      value: raw.value?.value,
      backendDOMNodeId: raw.backendDOMNodeId,
    })
  }

  return nodes
}

/**
 * Build a lookup map from backend DOM node ID → AX node info.
 * Allows O(1) merging of accessibility data with DOM elements.
 */
export function buildAXNodeMap(nodes: AXNodeInfo[]): Map<number, AXNodeInfo> {
  const map = new Map<number, AXNodeInfo>()
  for (const node of nodes) {
    map.set(node.backendDOMNodeId, node)
  }
  return map
}
