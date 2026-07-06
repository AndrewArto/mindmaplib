// NodeView: single node rendering — static HTML or TipTap editor.
//
// When not editing: renders pre-sanitized static HTML via generateHTML + DOMPurify.
// When editing: mounts a TipTap EditorContent instance with content from node.content.
// On exiting edit mode (Escape/click-away): reads TipTap JSON, converts to NodeContent,
// calls editor.updateContent(), then editor.stopEditing() — content persists BEFORE
// the editingNodeId clears to prevent losing unsaved edits.

import { memo, useEffect } from 'react'
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

  // TipTap editor instance for editing mode
  const tiptapEditor = useTipTapEditor({
    extensions: extensions,
    content: toTipTapJSON(node.content),
    editable: true,
    immediatelyRender: false,
  })

  // Register exitEditMode callback when entering edit mode
  useEffect(() => {
    if (isEditing && tiptapEditor) {
      exitEditModeRef.current = () => {
        if (!tiptapEditor) return
        const json = tiptapEditor.getJSON()
        const content = fromTipTapJSON(json)
        editor.updateContent(node.id, content)
        editor.stopEditing()
      }
      return () => {
        exitEditModeRef.current = null
      }
    }
  }, [isEditing, tiptapEditor, editor, node.id, exitEditModeRef])

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
      onMouseDown={() => {
        editor.select(node.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onNodeDoubleClick?.(node.id, e)
        if (!e.defaultPrevented) editor.startEditing(node.id)
      }}
    >
      {isEditing ? (
        <EditorContent
          editor={tiptapEditor}
          className="mml-node-content mml-node-content--editing"
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
