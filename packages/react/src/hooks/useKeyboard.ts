// useKeyboard: keyboard navigation handler for the canvas.
//
// Implements the keymap from MML-B-0001. Suspended automatically when
// editingNodeId is set (TipTap handles keyboard during editing).
// Escape during editing calls exitEditModeRef to persist content before
// clearing the editing state. After the exit call, we verify editingNodeId
// is actually null — if the exit function was stale (persistedRef already
// true, or editing component not yet mounted), we call editor.stopEditing()
// as a fallback to unblock all keyboard shortcuts.

import { useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type { LayoutMode, MindmapEditor, MindmapNode } from '@mindmaplib/core'
import { getChildren } from '@mindmaplib/core'
import type { KeyboardHandlers } from '../types.js'

function isMod(e: KeyboardEvent | globalThis.KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

async function resolveConfirm(
  fn: ((node: MindmapNode) => Promise<boolean> | boolean) | undefined,
  node: MindmapNode,
): Promise<boolean> {
  if (!fn) return true
  return await fn(node)
}

function relayoutIfAutoMode(editor: MindmapEditor, mode: LayoutMode): void {
  if (mode !== 'free-float') {
    editor.setLayout(mode)
  }
}

export function useKeyboard(
  editor: MindmapEditor,
  exitEditModeRef: React.RefObject<(() => void) | null>,
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean,
): KeyboardHandlers {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const state = editor.getState()

      // Suspended during text editing — TipTap handles keyboard.
      if (state.editingNodeId !== null) {
        if (e.key === 'Escape') {
          // Try to persist content via the editing component's exit handler.
          const fn = exitEditModeRef.current
          if (fn) fn()
          // Verify editingNodeId was actually cleared. The exit function may
          // be stale (persistedRef already true from a previous node) or the
          // editing component may not have mounted yet (exitEditModeRef is null).
          // In either case, force-clear to unblock keyboard shortcuts.
          if (editor.getState().editingNodeId !== null) {
            editor.stopEditing()
          }
          e.preventDefault()
        }
        return
      }

      const selectedId = state.selectedNodeId
      const doc = state.doc

      // Undo/Redo handled by global document listener in CanvasView
      // (works regardless of canvas focus). Zoom shortcuts below still
      // require canvas focus since they'''re canvas-specific.

      // Zoom shortcuts
      if (isMod(e) && (e.key === '=' || e.key === '+')) {
        const vp = state.viewport
        editor.setViewport({ ...vp, zoom: Math.min(vp.zoom * 1.2, 4) })
        e.preventDefault()
        return
      }
      if (isMod(e) && e.key === '-') {
        const vp = state.viewport
        editor.setViewport({ ...vp, zoom: Math.max(vp.zoom / 1.2, 0.1) })
        e.preventDefault()
        return
      }
      if (isMod(e) && e.key === '0') {
        editor.fitToScreen()
        e.preventDefault()
        return
      }

      if (!selectedId) return
      const selected = doc.nodes[selectedId]
      if (!selected) return

      switch (e.key) {
        case 'Tab': {
          if (e.shiftKey) {
            editor.promoteNode(selectedId)
            relayoutIfAutoMode(editor, state.layoutMode)
          } else {
            const newId = editor.addChild(selectedId)
            relayoutIfAutoMode(editor, state.layoutMode)
            editor.startEditing(newId)
          }
          e.preventDefault()
          break
        }
        case 'Enter': {
          if (selected.parentId === null) return
          const newId = editor.addSibling(selectedId)
          relayoutIfAutoMode(editor, state.layoutMode)
          editor.startEditing(newId)
          e.preventDefault()
          break
        }
        case 'ArrowUp': {
          if (!selected.parentId) return
          const siblings = getChildren(doc, selected.parentId)
          const idx = siblings.findIndex((s) => s.id === selectedId)
          if (idx > 0) editor.select(siblings[idx - 1].id)
          e.preventDefault()
          break
        }
        case 'ArrowDown': {
          if (!selected.parentId) return
          const siblings = getChildren(doc, selected.parentId)
          const idx = siblings.findIndex((s) => s.id === selectedId)
          if (idx < siblings.length - 1) editor.select(siblings[idx + 1].id)
          e.preventDefault()
          break
        }
        case 'ArrowLeft': {
          if (selected.parentId) editor.select(selected.parentId)
          e.preventDefault()
          break
        }
        case 'ArrowRight': {
          const children = selected.childOrder
          if (children.length === 0) return
          if (selected.collapsed) {
            editor.toggleCollapsed(selectedId)
          }
          editor.select(children[0])
          e.preventDefault()
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (selected.parentId === null) return
          const doDelete = () => {
            editor.deleteNode(selectedId)
            editor.select(null)
          }
          if (selected.childOrder.length > 0) {
            // Async-safe: resolve Promise<boolean> | boolean before deleting
            resolveConfirm(confirmDelete, selected).then((confirmed) => {
              if (confirmed) doDelete()
            })
          } else {
            doDelete()
          }
          e.preventDefault()
          break
        }
        case ' ':
        case 'F2': {
          editor.startEditing(selectedId)
          e.preventDefault()
          break
        }
        case 'Escape': {
          editor.select(null)
          e.preventDefault()
          break
        }
      }
    },
    [editor, exitEditModeRef, confirmDelete],
  )

  return { onKeyDown }
}
