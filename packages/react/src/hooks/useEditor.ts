// useEditor: React binding to MindmapEditor state.
//
// Subscribes on mount, unsubscribes on unmount. Returns current EditorState.
// Uses useState + useEffect pattern (not useSyncExternalStore) because
// editor.getState() returns a new object each call, which would cause
// infinite loops with useSyncExternalStore's snapshot comparison.

import { useState, useEffect } from 'react'
import type { EditorState, MindmapEditor } from '@mindmaplib/core'

/**
 * Subscribe to a MindmapEditor instance and re-render on every state change.
 * Returns the current EditorState.
 */
export function useEditor(editor: MindmapEditor): EditorState {
  const [state, setState] = useState<EditorState>(() => editor.getState())

  useEffect(() => {
    // Sync state on mount in case editor changed between render and effect
    setState(editor.getState())
    const unsubscribe = editor.subscribe((newState) => {
      setState(newState)
    })
    return unsubscribe
  }, [editor])

  return state
}
