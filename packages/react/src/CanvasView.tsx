// CanvasView: the spatial canvas with pan/zoom viewport.
//
// Single CSS transform on the container applies pan/zoom. SVG edge layer
// and HTML node layer are children of this container, using document coordinates.
// Node drag updates node position via editor.setPosition. Background drag pans.

import { useRef, useCallback, useMemo, useEffect } from 'react'
import type { NodeMeasures } from '@mindmaplib/core'
import { useEditor } from './hooks/useEditor.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useNodeMeasures } from './hooks/useNodeMeasures.js'
import { EdgeView } from './EdgeView.js'
import { NodeView } from './NodeView.js'
import { BackgroundGrid } from './BackgroundGrid.js'
import type { CanvasViewProps } from './types.js'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_WHEEL_FACTOR } from './types.js'

type Viewport = { x: number; y: number; zoom: number }

// Viewport culling: only render nodes within visible bounds + margin
const CULL_MARGIN = 200

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
    nodeId: string
    offsetX: number
    offsetY: number
  } | null>(null)

  const state = useEditor(editor)
  // Keep latest viewport and doc in refs so handlers stay stable
  const viewportRef = useRef(state.viewport)
  viewportRef.current = state.viewport
  const docRef = useRef(state.doc)
  docRef.current = state.doc
  const keyboard = useKeyboard(editor, exitEditModeRef, confirmDelete)
  useNodeMeasures(editor, containerRef)

  const { doc, viewport, selectedNodeId, editingNodeId, layoutMode } = state
  const containerW = containerRef.current?.clientWidth ?? 800
  const containerH = containerRef.current?.clientHeight ?? 600

  // Node measures for edge computation
  const measures =
    (editor as unknown as { __nodeMeasures?: NodeMeasures }).__nodeMeasures ??
    {}

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
      return isNodeVisible(node.position, viewport, containerW, containerH)
    })
  }, [doc, viewport, containerW, containerH])

  useEffect(() => {
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

  // Track drag final position for commitPosition on mouseup
  const dragFinalPos = useRef<{ x: number; y: number } | null>(null)

  // Document-level handlers: stable (deps [editor] only) because they read
  // viewport from viewportRef. This ensures add/removeEventListener reference
  // the same function instance, preventing listener leaks (P2 fix).

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const vp = viewportRef.current
      if (dragState.current) {
        const { nodeId, offsetX, offsetY } = dragState.current
        const rect = containerRef.current!.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        const docX = (screenX - vp.x) / vp.zoom - offsetX
        const docY = (screenY - vp.y) / vp.zoom - offsetY
        editor.setPositionDirect(nodeId, { x: docX, y: docY })
        dragFinalPos.current = { x: docX, y: docY }
        return
      }
      if (panState.current) {
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

  const handleDragEnd = useCallback(() => {
    if (dragState.current && dragFinalPos.current) {
      editor.commitPosition(dragState.current.nodeId, dragFinalPos.current)
    }
    dragState.current = null
    dragFinalPos.current = null
    panState.current = null
    document.removeEventListener('mousemove', handleDragMove)
    document.removeEventListener('mouseup', handleDragEnd)
  }, [editor, handleDragMove])

  // Unmount cleanup: commit pending drag, then remove document listeners
  // if component unmounts during an active pan/drag (P2 fixes from codex r2/r3)
  useEffect(() => {
    return () => {
      // If a drag was in progress, commit the final position so the editor
      // gets proper version bump + undo entry. Without this, setPositionDirect
      // changes are lost without undo semantics.
      if (dragState.current && dragFinalPos.current) {
        editor.commitPosition(dragState.current.nodeId, dragFinalPos.current)
      }
      document.removeEventListener('mousemove', handleDragMove)
      document.removeEventListener('mouseup', handleDragEnd)
      panState.current = null
      dragState.current = null
      dragFinalPos.current = null
    }
  }, [editor, handleDragMove, handleDragEnd])

  // Mousedown: start pan or node drag, attach document listeners
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // F1: Prevent default to stop native text selection and drag-and-drop
      // that would suppress mousemove events in real browsers.
      e.preventDefault()
      // P2: Explicitly focus canvas since preventDefault blocks native focus
      containerRef.current?.focus()

      const target = e.target as HTMLElement
      const nodeEl = target.closest('[data-node-id]')
      const vp = viewportRef.current
      const currentDoc = docRef.current

      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-node-id')
        if (nodeId) {
          const node = currentDoc.nodes[nodeId]
          if (node && node.position) {
            const rect = containerRef.current!.getBoundingClientRect()
            const screenX = e.clientX - rect.left
            const screenY = e.clientY - rect.top
            const docX = (screenX - vp.x) / vp.zoom
            const docY = (screenY - vp.y) / vp.zoom
            dragState.current = {
              nodeId,
              offsetX: docX - node.position.x,
              offsetY: docY - node.position.y,
            }
            document.addEventListener('mousemove', handleDragMove)
            document.addEventListener('mouseup', handleDragEnd)
            return
          }
        }
      }

      // A1: Background pan on any non-node child element
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
    [handleDragMove, handleDragEnd],
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
      className="mml-canvas"
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
                edge.childId === selectedNodeId ||
                edge.parentId === selectedNodeId
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
              isSelected={node.id === selectedNodeId}
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
