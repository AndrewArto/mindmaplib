import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditor } from '../src/hooks/useEditor.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

describe('useEditor', () => {
  it('returns initial EditorState', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { result } = renderHook(() => useEditor(editor))
    expect(result.current.doc.meta.title).toBe('Test')
    expect(result.current.selectedNodeId).toBeNull()
  })

  it('re-renders on state change', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { result } = renderHook(() => useEditor(editor))
    expect(result.current.selectedNodeId).toBeNull()
    act(() => {
      editor.select(doc.rootId)
    })
    expect(result.current.selectedNodeId).toBe(doc.rootId)
  })

  it('unsubscribes on unmount', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { result, unmount } = renderHook(() => useEditor(editor))
    unmount()
    act(() => {
      editor.select(doc.rootId)
    })
    expect(result.current.selectedNodeId).toBeNull()
  })
})
