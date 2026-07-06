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

  it('undo on Cmd+Z', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    editor.addChild(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(makeKbEvent('z', { metaKey: true }))
    })
    expect(editor.getState().doc.nodes[doc.rootId].childOrder.length).toBe(0)
  })

  it('redo on Cmd+Shift+Z', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    editor.addChild(doc.rootId)
    editor.undo()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => {
      result.current.onKeyDown(
        makeKbEvent('z', { metaKey: true, shiftKey: true }),
      )
    })
    expect(editor.getState().doc.nodes[doc.rootId].childOrder.length).toBe(1)
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
})
