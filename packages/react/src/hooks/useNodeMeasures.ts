// useNodeMeasures: ResizeObserver-based node measurement pipeline.
//
// Observes rendered node DOM elements (identified by data-node-id attribute),
// reports measured sizes to the editor for layout computation. Debounced 50ms.

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { MindmapEditor, NodeMeasure, NodeMeasures } from '@mindmaplib/core'

const DEBOUNCE_MS = 50
const DEFAULT_MEASURE: NodeMeasure = { width: 120, height: 40 }

function sizeFromBox(
  box: ResizeObserverSize | readonly ResizeObserverSize[] | undefined,
): NodeMeasure | null {
  const first = Array.isArray(box) ? box[0] : box
  if (!first) return null
  return {
    width: Math.round(first.inlineSize),
    height: Math.round(first.blockSize),
  }
}

function numericStyle(style: CSSStyleDeclaration, property: string): number {
  const value = Number.parseFloat(style.getPropertyValue(property))
  return Number.isFinite(value) ? value : 0
}

function measureBorderBox(
  el: HTMLElement,
  contentRect?: DOMRectReadOnly,
  borderBox?: ResizeObserverSize | readonly ResizeObserverSize[],
): NodeMeasure {
  const observedBorderBox = sizeFromBox(borderBox)
  if (observedBorderBox) return observedBorderBox

  if (el.offsetWidth > 0 || el.offsetHeight > 0) {
    return {
      width: Math.round(el.offsetWidth) || DEFAULT_MEASURE.width,
      height: Math.round(el.offsetHeight) || DEFAULT_MEASURE.height,
    }
  }

  if (contentRect) {
    const style = window.getComputedStyle(el)
    const width =
      contentRect.width +
      numericStyle(style, 'padding-left') +
      numericStyle(style, 'padding-right') +
      numericStyle(style, 'border-left-width') +
      numericStyle(style, 'border-right-width')
    const height =
      contentRect.height +
      numericStyle(style, 'padding-top') +
      numericStyle(style, 'padding-bottom') +
      numericStyle(style, 'border-top-width') +
      numericStyle(style, 'border-bottom-width')
    if (width > 0 || height > 0) {
      const rect = el.getBoundingClientRect()
      return {
        width: Math.round(Math.max(width, rect.width)) || DEFAULT_MEASURE.width,
        height:
          Math.round(Math.max(height, rect.height)) || DEFAULT_MEASURE.height,
      }
    }
  }

  const rect = el.getBoundingClientRect()
  return {
    width: Math.round(rect.width) || DEFAULT_MEASURE.width,
    height: Math.round(rect.height) || DEFAULT_MEASURE.height,
  }
}

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
        pendingMeasures.current[nodeId] = measureBorderBox(
          el,
          entry.contentRect,
          entry.borderBoxSize,
        )
      }
      debouncedFlush()
    }

    observerRef.current = new ResizeObserver(handleResize)

    // Scan for node elements and observe them
    const observeNodes = () => {
      if (!observerRef.current || !container) return
      let changed = false
      const nodeEls = container.querySelectorAll<HTMLElement>('[data-node-id]')
      nodeEls.forEach((el) => {
        observerRef.current!.observe(el)
        // Capture initial size immediately. ResizeObserver delivery is async;
        // toolbar/keyboard fit-to-screen can run before the first callback.
        const nodeId = el.getAttribute('data-node-id')
        if (nodeId && !knownMeasures.current[nodeId]) {
          knownMeasures.current[nodeId] = measureBorderBox(el)
          changed = true
        }
      })
      if (changed) editor.setNodeMeasures({ ...knownMeasures.current })
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
