import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboard } from '../src/hooks/useKeyboard.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'
import { createRef } from 'react'

function makeKbEvent(
  key: string,
  opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  return {
    key,
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLElement>
}

describe('useKeyboard', () => {
  it('adds child on Tab', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(makeKbEvent('Tab'))
    })
    const state = editor.getState()
    expect(state.doc.nodes[state.doc.rootId].childOrder.length).toBe(1)
    expect(state.editingNodeId).not.toBeNull()
  })

  it('suspends during editing except Escape', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    editor.startEditing(doc.rootId)
    const exitFn = vi.fn()
    const exitRef = createRef<(() => void) | null>()
    exitRef.current = exitFn
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    const tabEvent = makeKbEvent('Tab')
    result.current.onKeyDown(tabEvent)
    expect(tabEvent.preventDefault).not.toHaveBeenCalled()
    result.current.onKeyDown(makeKbEvent('Escape'))
    expect(exitFn).toHaveBeenCalledOnce()
  })

  it('escape deselects node', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(makeKbEvent('Escape'))
    })
    expect(editor.getState().selectedNodeId).toBeNull()
  })

  it('ArrowLeft navigates to parent', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.select(childId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(makeKbEvent('ArrowLeft'))
    })
    expect(editor.getState().selectedNodeId).toBe(doc.rootId)
  })

  it('ArrowRight expands collapsed node and navigates to first child', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.toggleCollapsed(doc.rootId)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(makeKbEvent('ArrowRight'))
    })
    const state = editor.getState()
    expect(state.doc.nodes[doc.rootId].collapsed).toBe(false)
    expect(state.selectedNodeId).toBe(childId)
  })

  it('reapplies auto layout after inserting a child', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.setLayout('tree-horizontal')
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => {
      result.current.onKeyDown(makeKbEvent('Tab'))
    })

    const childIds = editor.getDoc().nodes[doc.rootId].childOrder
    const newId = childIds[childIds.length - 1]
    expect(editor.getDoc().nodes[newId].position).not.toBeNull()
  })

  it('deletes non-root subtrees when no confirmation callback is provided', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.addChild(childId)
    editor.select(childId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => {
      result.current.onKeyDown(makeKbEvent('Delete'))
    })

    await Promise.resolve()
    expect(editor.getDoc().nodes[childId]).toBeUndefined()
  })
})
