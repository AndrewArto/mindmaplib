// CanvasView: the spatial canvas with pan/zoom viewport.
//
// Single CSS transform on the container applies pan/zoom. SVG edge layer
// and HTML node layer are children of this container, using document coordinates.
// Node drag updates node position via editor.setPosition. Background drag pans.

import { useRef, useCallback, useMemo } from 'react'
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

  // Pan handler (background drag)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).classList.contains('mml-canvas-pan-target')
      ) {
        panState.current = {
          startX: e.clientX,
          startY: e.clientY,
          vpX: viewport.x,
          vpY: viewport.y,
        }
      }
    },
    [viewport.x, viewport.y],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panState.current) {
        const dx = e.clientX - panState.current.startX
        const dy = e.clientY - panState.current.startY
        editor.setViewport({
          ...viewport,
          x: panState.current.vpX + dx,
          y: panState.current.vpY + dy,
        })
      }
      if (dragState.current) {
        const { nodeId, offsetX, offsetY } = dragState.current
        const screenX =
          e.clientX - containerRef.current!.getBoundingClientRect().left
        const screenY =
          e.clientY - containerRef.current!.getBoundingClientRect().top
        const docX = (screenX - viewport.x) / viewport.zoom - offsetX
        const docY = (screenY - viewport.y) / viewport.zoom - offsetY
        editor.setPosition(nodeId, { x: docX, y: docY })
      }
    },
    [editor, viewport],
  )

  const handleMouseUp = useCallback(() => {
    panState.current = null
    dragState.current = null
  }, [])

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
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export const CanvasView = CanvasViewComponent
