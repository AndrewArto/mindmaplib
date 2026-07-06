// useNodeMeasures: ResizeObserver-based node measurement pipeline.
//
// Observes rendered node DOM elements (identified by data-node-id attribute),
// reports measured sizes to the editor for layout computation. Debounced 50ms.

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { MindmapEditor, NodeMeasure, NodeMeasures } from '@mindmaplib/core'

const DEBOUNCE_MS = 50
const DEFAULT_MEASURE: NodeMeasure = { width: 120, height: 40 }

/**
 * Observe rendered node DOM elements and report sizes to the editor.
 * The observer re-scans when the set of visible nodes changes.
 */
export function useNodeMeasures(
  editor: MindmapEditor,
  containerRef: RefObject<HTMLElement | null>,
): void {
  const observerRef = useRef<ResizeObserver | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMeasures = useRef<NodeMeasures>({})
  const knownMeasures = useRef<NodeMeasures>({})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const flushMeasures = () => {
      const measures = pendingMeasures.current
      pendingMeasures.current = {}
      // Merge into known measures
      knownMeasures.current = { ...knownMeasures.current, ...measures }
      // Push to editor for layout (MML-B-0011)
      editor.setNodeMeasures({ ...knownMeasures.current })
    }

    const debouncedFlush = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(flushMeasures, DEBOUNCE_MS)
    }

    // Callback stores measures and debounces
    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const nodeId = el.getAttribute('data-node-id')
        if (!nodeId) continue
        const { width, height } = entry.contentRect
        pendingMeasures.current[nodeId] = {
          width: Math.round(width),
          height: Math.round(height),
        }
      }
      debouncedFlush()
    }

    observerRef.current = new ResizeObserver(handleResize)

    // Scan for node elements and observe them
    const observeNodes = () => {
      if (!observerRef.current || !container) return
      const nodeEls = container.querySelectorAll<HTMLElement>('[data-node-id]')
      nodeEls.forEach((el) => {
        observerRef.current!.observe(el)
        // Capture initial size
        const nodeId = el.getAttribute('data-node-id')
        if (nodeId) {
          const rect = el.getBoundingClientRect()
          if (!knownMeasures.current[nodeId]) {
            knownMeasures.current[nodeId] = {
              width: Math.round(rect.width) || DEFAULT_MEASURE.width,
              height: Math.round(rect.height) || DEFAULT_MEASURE.height,
            }
          }
        }
      })
    }

    observeNodes()

    // Re-observe when DOM changes (viewport culling adds/removes nodes)
    const mutationObserver = new MutationObserver(() => {
      // Disconnect and re-observe to pick up new nodes
      if (observerRef.current) {
        observerRef.current.disconnect()
        observeNodes()
      }
    })

    mutationObserver.observe(container, { childList: true, subtree: true })

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (observerRef.current) observerRef.current.disconnect()
      mutationObserver.disconnect()
    }
  }, [containerRef, editor])
}
