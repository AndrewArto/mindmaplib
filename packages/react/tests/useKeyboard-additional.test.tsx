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

function setupEditor() {
  const doc = createDoc('Test')
  const editor = new MindmapEditor(doc)
  const child1 = editor.addChild(doc.rootId)
  const child2 = editor.addChild(doc.rootId)
  editor.select(child1)
  return { editor, child1, child2, rootId: doc.rootId }
}

describe('useKeyboard additional', () => {
  it('Enter adds, selects, and starts editing the new sibling', () => {
    const { editor } = setupEditor()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('Enter')))
    const state = editor.getState()
    const childOrder = state.doc.nodes[state.doc.rootId].childOrder
    const newSiblingId = childOrder[1]
    expect(childOrder.length).toBe(3)
    expect(state.selectedNodeId).toBe(newSiblingId)
    expect(state.editingNodeId).toBe(newSiblingId)
  })

  it('Enter is no-op on root', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('Enter')))
    expect(editor.getState().doc.nodes[doc.rootId].childOrder.length).toBe(0)
  })

  it('ArrowDown navigates to next sibling', () => {
    const { editor, child2 } = setupEditor()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('ArrowDown')))
    expect(editor.getState().selectedNodeId).toBe(child2)
  })

  it('ArrowUp navigates to prev sibling', () => {
    const { editor, child1, child2 } = setupEditor()
    editor.select(child2)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('ArrowUp')))
    expect(editor.getState().selectedNodeId).toBe(child1)
  })

  it('ArrowDown walks the visible tree depth-first', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const child1 = editor.addChild(doc.rootId)
    const grandchild = editor.addChild(child1)
    const child2 = editor.addChild(doc.rootId)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => result.current.onKeyDown(makeKbEvent('ArrowDown')))
    expect(editor.getState().selectedNodeId).toBe(child1)
    act(() => result.current.onKeyDown(makeKbEvent('ArrowDown')))
    expect(editor.getState().selectedNodeId).toBe(grandchild)
    act(() => result.current.onKeyDown(makeKbEvent('ArrowDown')))
    expect(editor.getState().selectedNodeId).toBe(child2)
  })

  it('ArrowUp walks the visible tree in reverse depth-first order', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const child1 = editor.addChild(doc.rootId)
    const grandchild = editor.addChild(child1)
    const child2 = editor.addChild(doc.rootId)
    editor.select(child2)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => result.current.onKeyDown(makeKbEvent('ArrowUp')))
    expect(editor.getState().selectedNodeId).toBe(grandchild)
    act(() => result.current.onKeyDown(makeKbEvent('ArrowUp')))
    expect(editor.getState().selectedNodeId).toBe(child1)
    act(() => result.current.onKeyDown(makeKbEvent('ArrowUp')))
    expect(editor.getState().selectedNodeId).toBe(doc.rootId)
  })

  it('Delete removes node', () => {
    const { editor, child1 } = setupEditor()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('Delete')))
    expect(editor.getState().doc.nodes[child1]).toBeUndefined()
  })

  it('Delete is no-op on root', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('Delete')))
    expect(editor.getState().doc.nodes[doc.rootId]).toBeDefined()
  })

  it('Space enters edit mode', () => {
    const { editor, child1 } = setupEditor()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent(' ')))
    expect(editor.getState().editingNodeId).toBe(child1)
  })

  it('F2 enters edit mode', () => {
    const { editor, child1 } = setupEditor()
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('F2')))
    expect(editor.getState().editingNodeId).toBe(child1)
  })

  it('Tab promotes on Shift+Tab', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    const grandchild = editor.addChild(childId)
    editor.select(grandchild)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('Tab', { shiftKey: true })))
    // After promote, grandchild should be a child of root
    expect(editor.getState().doc.nodes[doc.rootId].childOrder).toContain(
      grandchild,
    )
  })

  it('Cmd+Plus zooms in', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.select(doc.rootId)
    const initialZoom = editor.getState().viewport.zoom
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('+', { metaKey: true })))
    expect(editor.getState().viewport.zoom).toBeGreaterThan(initialZoom)
  })

  it('Cmd+Minus zooms out', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setViewport({ x: 0, y: 0, zoom: 2 })
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    act(() => result.current.onKeyDown(makeKbEvent('-', { metaKey: true })))
    expect(editor.getState().viewport.zoom).toBeLessThan(2)
  })

  it('Cmd+0 fits to screen using real canvas dimensions when available', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() =>
      useKeyboard(editor, exitRef, undefined, () => ({
        width: 600,
        height: 400,
      })),
    )
    act(() => result.current.onKeyDown(makeKbEvent('0', { metaKey: true })))
    expect(editor.getState().viewport.zoom).toBeGreaterThan(1)
  })

  it('no selection returns early for most keys', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))
    // Should not throw
    act(() => result.current.onKeyDown(makeKbEvent('Tab')))
    expect(editor.getState().doc.nodes[doc.rootId].childOrder.length).toBe(0)
  })
})
