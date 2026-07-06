// NodeView: single node rendering — static HTML or TipTap editor.
//
// When not editing: renders pre-sanitized static HTML via generateHTML + DOMPurify.
// When editing: mounts a TipTap EditorContent instance with content from node.content.
// On exiting edit mode (Escape/click-away): reads TipTap JSON, converts to NodeContent,
// calls editor.updateContent(), then editor.stopEditing() — content persists BEFORE
// the editingNodeId clears to prevent losing unsaved edits.

import { memo, useEffect, useRef } from 'react'
import { EditorContent, useEditor as useTipTapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { generateHTML } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import type { NodeContent } from '@mindmaplib/core'
import { sanitizeMindmapHtml } from './sanitize.js'
import { toTipTapJSON, fromTipTapJSON } from './content.js'
import type { NodeViewProps } from './types.js'

const DEFAULT_EXTENSIONS: Extensions = [
  StarterKit,
  Link.configure({ openOnClick: false }),
]

function nodePropsEqual(prev: NodeViewProps, next: NodeViewProps): boolean {
  return (
    prev.node === next.node &&
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    prev.tiptapExtensions === next.tiptapExtensions &&
    prev.customNodeRenderer === next.customNodeRenderer
  )
}

function EditingNodeContent({
  node,
  editor,
  extensions,
  exitEditModeRef,
}: Pick<NodeViewProps, 'node' | 'editor' | 'exitEditModeRef'> & {
  extensions: Extensions
}): React.ReactElement {
  const persistedRef = useRef(false)
  const tiptapEditor = useTipTapEditor({
    extensions: extensions,
    content: toTipTapJSON(node.content),
    editable: true,
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!tiptapEditor) return

    const persist = () => {
      if (persistedRef.current) return
      persistedRef.current = true
      const json = tiptapEditor.getJSON()
      const content = fromTipTapJSON(json)
      editor.updateContent(node.id, content)
      if (editor.getState().editingNodeId === node.id) {
        editor.stopEditing()
      }
    }

    exitEditModeRef.current = persist
    return () => {
      persist()
      if (exitEditModeRef.current === persist) {
        exitEditModeRef.current = null
      }
    }
  }, [tiptapEditor, editor, node.id, exitEditModeRef])

  return (
    <EditorContent
      editor={tiptapEditor}
      className="mml-node-content mml-node-content--editing"
    />
  )
}

function NodeViewComponent({
  node,
  editor,
  isSelected,
  isEditing,
  tiptapExtensions,
  customNodeRenderer,
  exitEditModeRef,
  onNodeDoubleClick,
}: NodeViewProps): React.ReactElement {
  const extensions = tiptapExtensions ?? DEFAULT_EXTENSIONS

  // Static HTML computation (memoized by React via the outer memo comparator
  // comparing node reference and extensions reference)
  const rawHtml = isEditing
    ? ''
    : generateHTML(
        node.content as unknown as Record<string, unknown>,
        extensions,
      )
  const html = sanitizeMindmapHtml(rawHtml)

  const className = [
    'mml-node',
    isSelected ? 'mml-node--selected' : '',
    isEditing ? 'mml-node--editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      data-node-id={node.id}
      style={{
        position: 'absolute',
        left: `${node.position?.x ?? 0}px`,
        top: `${node.position?.y ?? 0}px`,
      }}
      onMouseDown={(e) => {
        // F1/F5: Prevent native drag on node content. Let event bubble
        // so canvas handleMouseDown can start node drag.
        e.preventDefault()
        editor.select(node.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onNodeDoubleClick?.(node.id, e)
        if (!e.defaultPrevented) editor.startEditing(node.id)
      }}
    >
      {isEditing ? (
        <EditingNodeContent
          node={node}
          editor={editor}
          extensions={extensions}
          exitEditModeRef={exitEditModeRef}
        />
      ) : customNodeRenderer ? (
        customNodeRenderer({ node, editor, isEditing, html })
      ) : (
        <div
          className="mml-node-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}

export const NodeView = memo(NodeViewComponent, nodePropsEqual)

export { DEFAULT_EXTENSIONS }
export type { NodeContent }
