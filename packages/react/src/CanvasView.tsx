import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { useEditor } from './hooks/useEditor.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useNodeMeasures } from './hooks/useNodeMeasures.js'
import { EdgeView } from './EdgeView.js'
import { NodeView } from './NodeView.js'
import { BackgroundGrid } from './BackgroundGrid.js'
import type { CanvasViewProps } from './types.js'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_WHEEL_FACTOR } from './types.js'
import type { PositionUpdate } from '@mindmaplib/core'

type Viewport = { x: number; y: number; zoom: number }

// Viewport culling: only render nodes within visible bounds + margin
const CULL_MARGIN = 200
const INTERACTION_THRESHOLD = 4

type MarqueeRect = { left: number; top: number; width: number; height: number }

function isNodeVisible(
  nodePos: { x: number; y: number } | null,
  viewport: Viewport,
  containerW: number,
  containerH: number,
): boolean {
  // Nodes with null position default to {0,0} — still rendered
  const pos = nodePos ?? { x: 0, y: 0 }
  // Convert document coords to screen coords
  const screenX = pos.x * viewport.zoom + viewport.x
  const screenY = pos.y * viewport.zoom + viewport.y
  return (
    screenX > -CULL_MARGIN &&
    screenX < containerW + CULL_MARGIN &&
    screenY > -CULL_MARGIN &&
    screenY < containerH + CULL_MARGIN
  )
}

function clampZoom(z: number): number {
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM)
}

function CanvasViewComponent({
  editor,
  showGrid,
  gridType,
  tiptapExtensions,
  customNodeRenderer,
  confirmDelete,
  exitEditModeRef,
  onNodeDoubleClick,
  selectToCenter = false,
}: CanvasViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const panState = useRef<{
    startX: number
    startY: number
    vpX: number
    vpY: number
  } | null>(null)
  const dragState = useRef<{
    startClientX: number
    startClientY: number
    zoom: number
    startPositions: PositionUpdate[]
    finalPositions: PositionUpdate[] | null
    previewId: number | null
    activated: boolean
  } | null>(null)
  const marqueeState = useRef<{
    startLocalX: number
    startLocalY: number
    viewport: Viewport
    candidates: Array<{
      nodeId: string
      left: number
      top: number
      right: number
      bottom: number
    }>
    hitIds: string[]
    activated: boolean
  } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const [marqueeHitIds, setMarqueeHitIds] = useState<string[]>([])
  const finishInteractionRef = useRef<(event?: MouseEvent) => void>(() => {})
  const suppressViewportAdjustmentRef = useRef(false)
  const viewportSuppressionTimerRef = useRef<number | null>(null)

  const state = useEditor(editor)
  // Keep latest viewport and doc in refs so handlers stay stable
  const viewportRef = useRef(state.viewport)
  viewportRef.current = state.viewport
  const docRef = useRef(state.doc)
  docRef.current = state.doc
  const editingNodeIdRef = useRef(state.editingNodeId)
  editingNodeIdRef.current = state.editingNodeId
  const getFitToScreenSize = useCallback(() => {
    const container = containerRef.current
    if (!container) return undefined
    const rect = container.getBoundingClientRect()
    const width = container.clientWidth || rect.width
    const height = container.clientHeight || rect.height
    if (width <= 0 || height <= 0) return undefined
    return { width, height }
  }, [])
  const keyboard = useKeyboard(
    editor,
    exitEditModeRef,
    confirmDelete,
    getFitToScreenSize,
  )
  useNodeMeasures(editor, containerRef)

  useEffect(() => {
    if (editor.getState().editingNodeId === null) {
      containerRef.current?.focus()
    }
  }, [editor])

  const {
    doc,
    viewport,
    selectedNodeId,
    selectedNodeIds,
    editingNodeId,
    layoutMode,
  } = state
  const selectedIdSet = useMemo(
    () => new Set(selectedNodeIds),
    [selectedNodeIds],
  )
  const renderedSelectedIdSet = useMemo(
    () => (marqueeRect ? new Set(marqueeHitIds) : selectedIdSet),
    [marqueeRect, marqueeHitIds, selectedIdSet],
  )
  const cullingExemptIdSet = useMemo(() => {
    if (marqueeRect) return new Set(marqueeHitIds)
    if (dragState.current) {
      return new Set(
        dragState.current.startPositions.map(({ nodeId }) => nodeId),
      )
    }
    return new Set(selectedNodeId ? [selectedNodeId] : [])
  }, [doc, marqueeRect, marqueeHitIds, selectedNodeId])
  const containerW = containerRef.current?.clientWidth ?? 800
  const containerH = containerRef.current?.clientHeight ?? 600

  // Node measures for edge computation
  const measures = editor.getNodeMeasures()

  // Build edge list: parent -> child for all visible parent-child pairs
  const edges = useMemo(() => {
    const result: Array<{
      parentId: string
      childId: string
      parentPos: { x: number; y: number }
      childPos: { x: number; y: number }
    }> = []
    const walk = (nodeId: string) => {
      const node = doc.nodes[nodeId]
      if (!node || node.collapsed) return
      for (const childId of node.childOrder) {
        const child = doc.nodes[childId]
        if (!child || !child.position || !node.position) continue
        result.push({
          parentId: nodeId,
          childId,
          parentPos: node.position,
          childPos: child.position,
        })
        walk(childId)
      }
    }
    if (doc.rootId && doc.nodes[doc.rootId]) walk(doc.rootId)
    return result
  }, [doc])

  // Visible nodes (viewport culling)
  // CRITICAL: The editing node must NEVER be culled. If it's removed from the
  // DOM, the TipTap editor unmounts, exitEditModeRef.current becomes null, and
  // editingNodeId gets stuck — blocking all keyboard shortcuts.
  const visibleNodes = useMemo(() => {
    return Object.values(doc.nodes).filter((node) => {
      // Don't render descendants of collapsed nodes
      // Check if any ancestor is collapsed
      let parentId = node.parentId
      while (parentId !== null) {
        const parent = doc.nodes[parentId]
        if (!parent) break
        if (parent.collapsed) return false
        parentId = parent.parentId
      }
      // Always render the editing AND selected node, even if off-screen.
      // Without this, after Escape from editing the selected node can be
      // culled, leaving no visible selection — arrow navigation appears dead.
      if (node.id === editingNodeId || cullingExemptIdSet.has(node.id)) {
        return true
      }
      return isNodeVisible(node.position, viewport, containerW, containerH)
    })
  }, [doc, viewport, containerW, containerH, editingNodeId, cullingExemptIdSet])

  // Global undo/redo: works regardless of canvas focus.
  // The canvas onKeyDown only fires when the canvas div has focus, which
  // breaks Cmd+Z after interacting with toolbar buttons, the sidebar, or
  // on initial page load. This document-level listener catches undo/redo
  // from anywhere, with guards for text editing and form inputs.
  useEffect(() => {
    const handleGlobalUndo = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return
      const key = e.key.toLowerCase()
      const isUndo = key === 'z' && !e.shiftKey
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y'
      if (!isUndo && !isRedo) return

      // Skip during text editing — TipTap handles its own undo/redo
      if (editingNodeIdRef.current !== null) return

      // Skip when focus is in a form field or contenteditable
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (active.isContentEditable) return
      }

      if (isUndo) {
        editor.undo()
      } else {
        editor.redo()
      }
      e.preventDefault()
    }

    document.addEventListener('keydown', handleGlobalUndo)
    return () => document.removeEventListener('keydown', handleGlobalUndo)
  }, [editor])

  useEffect(() => {
    if (
      suppressViewportAdjustmentRef.current ||
      dragState.current ||
      marqueeState.current
    ) {
      return
    }
    if (!selectToCenter || !selectedNodeId) return
    const node = doc.nodes[selectedNodeId]
    const position = node?.position
    if (!position) return
    const measure = measures[selectedNodeId]
    const width = measure?.width ?? 120
    const height = measure?.height ?? 40
    const nextViewport = {
      ...viewport,
      x: containerW / 2 - (position.x + width / 2) * viewport.zoom,
      y: containerH / 2 - (position.y + height / 2) * viewport.zoom,
    }
    if (
      Math.abs(nextViewport.x - viewport.x) > 0.5 ||
      Math.abs(nextViewport.y - viewport.y) > 0.5
    ) {
      editor.setViewport(nextViewport)
    }
  }, [
    selectToCenter,
    selectedNodeId,
    doc,
    measures,
    viewport,
    containerW,
    containerH,
    editor,
  ])

  // Pan viewport minimally so the selected node is visible after
  // selection/navigation changes. Deliberately read the current viewport from
  // a ref and do NOT depend on viewport updates: user pan/zoom must not be
  // pulled back just because the selected node crosses the margin.
  useEffect(() => {
    if (
      suppressViewportAdjustmentRef.current ||
      dragState.current ||
      marqueeState.current
    ) {
      return
    }
    if (!selectedNodeId) return
    if (containerW < 50 || containerH < 50) return
    const node = doc.nodes[selectedNodeId]
    const position = node?.position
    if (!position) return
    const vp = viewportRef.current
    const measure = measures[selectedNodeId]
    const nodeW = (measure?.width ?? 120) * vp.zoom
    const nodeH = (measure?.height ?? 40) * vp.zoom
    const screenX = position.x * vp.zoom + vp.x
    const screenY = position.y * vp.zoom + vp.y
    const margin = 40
    const availableW = Math.max(containerW - margin * 2, 1)
    const availableH = Math.max(containerH - margin * 2, 1)
    let nextX = vp.x
    let nextY = vp.y

    if (nodeW > availableW) {
      nextX = containerW / 2 - (position.x + nodeW / vp.zoom / 2) * vp.zoom
    } else if (screenX < margin) {
      nextX = vp.x + (margin - screenX)
    } else if (screenX + nodeW > containerW - margin) {
      nextX = vp.x + (containerW - margin - (screenX + nodeW))
    }

    if (nodeH > availableH) {
      nextY = containerH / 2 - (position.y + nodeH / vp.zoom / 2) * vp.zoom
    } else if (screenY < margin) {
      nextY = vp.y + (margin - screenY)
    } else if (screenY + nodeH > containerH - margin) {
      nextY = vp.y + (containerH - margin - (screenY + nodeH))
    }

    if (Math.abs(nextX - vp.x) > 0.5 || Math.abs(nextY - vp.y) > 0.5) {
      editor.setViewport({ ...vp, x: nextX, y: nextY })
    }
  }, [selectedNodeId, doc, measures, containerW, containerH, editor])

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      if (e.isTrusted && (e.buttons & 1) === 0) {
        finishInteractionRef.current()
        return
      }

      if (marqueeState.current) {
        const interaction = marqueeState.current
        const rect = container.getBoundingClientRect()
        const rawLocalX = e.clientX - rect.left
        const rawLocalY = e.clientY - rect.top
        const currentLocalX =
          rect.width > 0
            ? Math.min(Math.max(rawLocalX, 0), rect.width)
            : rawLocalX
        const currentLocalY =
          rect.height > 0
            ? Math.min(Math.max(rawLocalY, 0), rect.height)
            : rawLocalY
        const dx = currentLocalX - interaction.startLocalX
        const dy = currentLocalY - interaction.startLocalY
        if (
          !interaction.activated &&
          Math.hypot(dx, dy) < INTERACTION_THRESHOLD
        ) {
          return
        }
        interaction.activated = true
        const left = Math.min(interaction.startLocalX, currentLocalX)
        const top = Math.min(interaction.startLocalY, currentLocalY)
        const right = Math.max(interaction.startLocalX, currentLocalX)
        const bottom = Math.max(interaction.startLocalY, currentLocalY)
        setMarqueeRect({ left, top, width: right - left, height: bottom - top })

        const docLeft =
          (left - interaction.viewport.x) / interaction.viewport.zoom
        const docTop =
          (top - interaction.viewport.y) / interaction.viewport.zoom
        const docRight =
          (right - interaction.viewport.x) / interaction.viewport.zoom
        const docBottom =
          (bottom - interaction.viewport.y) / interaction.viewport.zoom
        interaction.hitIds = interaction.candidates
          .filter(
            (candidate) =>
              candidate.left <= docRight &&
              candidate.right >= docLeft &&
              candidate.top <= docBottom &&
              candidate.bottom >= docTop,
          )
          .map((candidate) => candidate.nodeId)
        setMarqueeHitIds(interaction.hitIds)
        return
      }

      if (dragState.current) {
        const interaction = dragState.current
        const dx = e.clientX - interaction.startClientX
        const dy = e.clientY - interaction.startClientY
        if (
          !interaction.activated &&
          Math.hypot(dx, dy) < INTERACTION_THRESHOLD
        ) {
          return
        }
        interaction.activated = true
        const docDx = dx / interaction.zoom
        const docDy = dy / interaction.zoom
        const updates = interaction.startPositions.map(
          ({ nodeId, position }) => ({
            nodeId,
            position: { x: position.x + docDx, y: position.y + docDy },
          }),
        )
        try {
          interaction.previewId = editor.setPositionsDirect(
            updates,
            interaction.previewId ?? undefined,
          )
          interaction.finalPositions = updates
        } catch {
          finishInteractionRef.current()
        }
        return
      }

      if (panState.current) {
        const vp = viewportRef.current
        const dx = e.clientX - panState.current.startX
        const dy = e.clientY - panState.current.startY
        editor.setViewport({
          ...vp,
          x: panState.current.vpX + dx,
          y: panState.current.vpY + dy,
        })
      }
    },
    [editor],
  )

  const suppressViewportAdjustment = useCallback(() => {
    suppressViewportAdjustmentRef.current = true
    if (viewportSuppressionTimerRef.current !== null) {
      window.clearTimeout(viewportSuppressionTimerRef.current)
    }
    viewportSuppressionTimerRef.current = window.setTimeout(() => {
      suppressViewportAdjustmentRef.current = false
      viewportSuppressionTimerRef.current = null
    }, 0)
  }, [])

  const handleDragEnd = useCallback(
    (event?: MouseEvent) => {
      if (event && event.button !== 0) return
      const drag = dragState.current
      const marquee = marqueeState.current
      try {
        if (marquee?.activated) {
          suppressViewportAdjustment()
          editor.setSelection(marquee.hitIds)
        }
        if (drag?.activated && drag.finalPositions) {
          suppressViewportAdjustment()
          editor.commitPositions(
            drag.finalPositions,
            drag.previewId ?? undefined,
          )
        }
      } catch {
        if (drag?.previewId !== null && drag?.previewId !== undefined) {
          editor.cancelPositionPreview(drag.previewId)
        }
      } finally {
        marqueeState.current = null
        dragState.current = null
        panState.current = null
        setMarqueeRect(null)
        setMarqueeHitIds([])
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }
    },
    [editor, handleDragMove, suppressViewportAdjustment],
  )
  finishInteractionRef.current = handleDragEnd

  useEffect(() => {
    const cancelInteraction = () => {
      const drag = dragState.current
      try {
        if (drag?.previewId !== null && drag?.previewId !== undefined) {
          editor.cancelPositionPreview(drag.previewId)
        }
      } finally {
        marqueeState.current = null
        dragState.current = null
        panState.current = null
        setMarqueeRect(null)
        setMarqueeHitIds([])
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }
    }
    window.addEventListener('blur', cancelInteraction)
    return () => {
      window.removeEventListener('blur', cancelInteraction)
      const drag = dragState.current
      try {
        if (drag?.activated && drag.finalPositions) {
          editor.commitPositions(
            drag.finalPositions,
            drag.previewId ?? undefined,
          )
        } else if (drag?.previewId !== null && drag?.previewId !== undefined) {
          editor.cancelPositionPreview(drag.previewId)
        }
      } catch {
        if (drag?.previewId !== null && drag?.previewId !== undefined) {
          editor.cancelPositionPreview(drag.previewId)
        }
      } finally {
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
        if (viewportSuppressionTimerRef.current !== null) {
          window.clearTimeout(viewportSuppressionTimerRef.current)
        }
        panState.current = null
        dragState.current = null
        marqueeState.current = null
      }
    }
  }, [editor, handleDragMove, handleDragEnd])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      const nodeEl = target.closest('[data-node-id]')
      const vp = viewportRef.current
      const currentDoc = docRef.current

      if (nodeEl) {
        const clickedId = nodeEl.getAttribute('data-node-id')
        if (clickedId && clickedId === editingNodeIdRef.current) return
      }

      if (editingNodeIdRef.current) {
        const exitFn = exitEditModeRef.current
        if (exitFn) exitFn()
        if (editor.getState().editingNodeId !== null) editor.stopEditing()
      }

      e.preventDefault()
      containerRef.current?.focus()

      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-node-id')
        const node = nodeId ? currentDoc.nodes[nodeId] : undefined
        if (nodeId && node) {
          const currentSelection = editor.getState().selectedNodeIds
          const nodeIds = currentSelection.includes(nodeId)
            ? currentSelection
            : [nodeId]
          const startPositions = nodeIds.flatMap((selectedId) => {
            const selectedNode = currentDoc.nodes[selectedId]
            if (!selectedNode) return []
            const position = selectedNode.position ?? { x: 0, y: 0 }
            return [{ nodeId: selectedId, position: { ...position } }]
          })
          dragState.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            zoom: vp.zoom,
            startPositions,
            finalPositions: null,
            previewId: null,
            activated: false,
          }
          document.addEventListener('mousemove', handleDragMove)
          document.addEventListener('mouseup', handleDragEnd)
          return
        }
      }

      if (!nodeEl && e.shiftKey) {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const candidates: NonNullable<
          typeof marqueeState.current
        >['candidates'] = []
        const measures = editor.getNodeMeasures()
        const walk = (nodeId: string): void => {
          const node = currentDoc.nodes[nodeId]
          if (!node) return
          const position = node.position ?? { x: 0, y: 0 }
          const measure = measures[nodeId] ?? { width: 120, height: 40 }
          candidates.push({
            nodeId,
            left: position.x,
            top: position.y,
            right: position.x + measure.width,
            bottom: position.y + measure.height,
          })
          if (node.collapsed) return
          for (const childId of node.childOrder) walk(childId)
        }
        walk(currentDoc.rootId)
        marqueeState.current = {
          startLocalX: e.clientX - rect.left,
          startLocalY: e.clientY - rect.top,
          viewport: { ...vp },
          candidates,
          hitIds: [],
          activated: false,
        }
        document.addEventListener('mousemove', handleDragMove)
        document.addEventListener('mouseup', handleDragEnd)
        return
      }

      if (!nodeEl) {
        panState.current = {
          startX: e.clientX,
          startY: e.clientY,
          vpX: vp.x,
          vpY: vp.y,
        }
        document.addEventListener('mousemove', handleDragMove)
        document.addEventListener('mouseup', handleDragEnd)
      }
    },
    [handleDragMove, handleDragEnd, editor],
  )

  // Zoom handler (wheel, zoom-to-cursor)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = containerRef.current!.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const factor = e.deltaY * ZOOM_WHEEL_FACTOR
      const newZoom = clampZoom(viewport.zoom * (1 - factor))
      const docX = (mouseX - viewport.x) / viewport.zoom
      const docY = (mouseY - viewport.y) / viewport.zoom
      editor.setViewport({
        x: mouseX - docX * newZoom,
        y: mouseY - docY * newZoom,
        zoom: newZoom,
      })
    },
    [editor, viewport],
  )

  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`

  // Calculate background grid extent to cover the visible area
  const gridW = 10000
  const gridH = 10000

  return (
    <div
      ref={containerRef}
      className={`mml-canvas ${marqueeRect ? 'mml-canvas--marquee' : ''}`}
      role="application"
      aria-label="Mindmap canvas"
      tabIndex={0}
      onKeyDown={keyboard.onKeyDown}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onDoubleClick={(e) => {
        // Background double-click: could add root-level node; for now no-op
        e.stopPropagation()
      }}
    >
      {marqueeRect && (
        <div
          className="mml-selection-marquee"
          style={marqueeRect}
          aria-hidden="true"
        />
      )}
      <div
        className="mml-canvas-viewport mml-canvas-pan-target"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform,
          transformOrigin: '0 0',
          width: `${gridW}px`,
          height: `${gridH}px`,
        }}
      >
        {showGrid && (
          <BackgroundGrid type={gridType} width={gridW} height={gridH} />
        )}

        {/* SVG edge layer */}
        <svg
          className="mml-edges-layer"
          width={gridW}
          height={gridH}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {edges.map((edge) => (
            <EdgeView
              key={`${edge.parentId}-${edge.childId}`}
              parentId={edge.parentId}
              childId={edge.childId}
              parentPosition={edge.parentPos}
              childPosition={edge.childPos}
              parentMeasure={measures[edge.parentId] ?? null}
              childMeasure={measures[edge.childId] ?? null}
              layoutMode={layoutMode}
              isSelected={
                renderedSelectedIdSet.has(edge.childId) ||
                renderedSelectedIdSet.has(edge.parentId)
              }
            />
          ))}
        </svg>

        {/* HTML node layer */}
        <div
          className="mml-nodes-layer"
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          {visibleNodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              editor={editor}
              isSelected={renderedSelectedIdSet.has(node.id)}
              isEditing={node.id === editingNodeId}
              tiptapExtensions={tiptapExtensions}
              customNodeRenderer={customNodeRenderer}
              exitEditModeRef={exitEditModeRef}
              onNodeDoubleClick={onNodeDoubleClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export const CanvasView = CanvasViewComponent
