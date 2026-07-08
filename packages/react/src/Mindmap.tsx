// Mindmap: the root component — composes canvas + outline.
//
// Creates the editor binding, renders canvas and outline side by side,
// wires callback props, manages the exitEditMode ref bridge between
// the keyboard hook and NodeView's TipTap instance.

import { useRef, useEffect, useMemo } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import type { Extensions } from '@tiptap/core'
import { CanvasView } from './CanvasView.js'
import { OutlineView } from './OutlineView.js'
import { useEditor } from './hooks/useEditor.js'
import type { MindmapProps } from './types.js'
import { DEFAULT_OUTLINE_WIDTH } from './types.js'

function MindmapComponent(props: MindmapProps): React.ReactElement {
  const {
    editor,
    showOutline = true,
    outlineWidth = DEFAULT_OUTLINE_WIDTH,
    showGrid = true,
    gridType = 'dots',
    selectToCenter = false,
    layoutMode,
    outlineShowToolbar = false,
    outlineSearchable = false,
    confirmDelete,
    customNodeRenderer,
    className,
    onChange,
    onSelectionChange,
    onReady,
    onNodeDoubleClick,
    tiptapExtensions,
  } = props

  const exitEditModeRef = useRef<(() => void) | null>(null)

  // Default TipTap extensions
  const extensions: Extensions = useMemo(() => {
    return (
      tiptapExtensions ?? [StarterKit, Link.configure({ openOnClick: false })]
    )
  }, [tiptapExtensions])

  // Subscribe to editor for callback routing
  const state = useEditor(editor)
  const lastSelectedId = useRef<string | null>(state.selectedNodeId)
  const lastVersion = useRef<number>(state.doc.version)

  useEffect(() => {
    onReady?.(editor)
  }, [])

  useEffect(() => {
    const current = editor.getState()
    const selectedId = current.selectedNodeId
    if (selectedId && Object.hasOwn(current.doc.nodes, selectedId)) return
    editor.select(current.doc.rootId)
  }, [editor, state.doc.id])

  useEffect(() => {
    if (state.selectedNodeId !== lastSelectedId.current) {
      lastSelectedId.current = state.selectedNodeId
      onSelectionChange?.(state.selectedNodeId)
    }
  }, [state.selectedNodeId, onSelectionChange])

  useEffect(() => {
    if (state.doc.version !== lastVersion.current) {
      lastVersion.current = state.doc.version
      const tx = editor.getLastTransaction()
      if (onChange && tx) {
        onChange(tx, state.doc)
      }
    }
  }, [state.doc.version, state.doc, onChange])

  // Set initial layout mode
  useEffect(() => {
    if (layoutMode && editor.getState().layoutMode !== layoutMode) {
      editor.setLayout(layoutMode)
    }
  }, [])

  const containerClass = `mml-container ${className ?? ''}`

  return (
    <div
      className={containerClass}
      style={{ display: 'flex', width: '100%', height: '100%' }}
    >
      <div
        className="mml-canvas-wrapper"
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
      >
        <CanvasView
          editor={editor}
          showGrid={showGrid}
          gridType={gridType}
          tiptapExtensions={extensions}
          customNodeRenderer={customNodeRenderer}
          confirmDelete={confirmDelete}
          selectToCenter={selectToCenter}
          exitEditModeRef={exitEditModeRef}
          onNodeDoubleClick={onNodeDoubleClick}
        />
      </div>
      {showOutline && (
        <div
          className="mml-outline-wrapper"
          style={{
            width: `${outlineWidth}px`,
            flexShrink: 0,
            overflow: 'auto',
            borderLeft: '1px solid var(--mml-border, #e0e0e0)',
          }}
        >
          <OutlineView
            editor={editor}
            selectedId={state.selectedNodeId}
            showToolbar={outlineShowToolbar}
            searchable={outlineSearchable}
            selectToCenter={selectToCenter}
            confirmDelete={confirmDelete}
            onNodeDoubleClick={onNodeDoubleClick}
          />
        </div>
      )}
    </div>
  )
}

export const Mindmap = MindmapComponent
