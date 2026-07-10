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
    const newId = state.doc.nodes[state.doc.rootId].childOrder[0]
    expect(state.doc.nodes[state.doc.rootId].childOrder.length).toBe(1)
    expect(state.selectedNodeId).toBe(newId)
    expect(state.editingNodeId).toBe(newId)
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

  it('undo removes a newly inserted auto-layout child in one step', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => {
      result.current.onKeyDown(makeKbEvent('Tab'))
    })
    const insertedId = editor.getState().selectedNodeId!
    expect(editor.getDoc().nodes[insertedId]?.position).not.toBeNull()

    act(() => {
      editor.updateContent(
        insertedId,
        editor.getDoc().nodes[insertedId]!.content,
      )
      editor.stopEditing()
      editor.undo()
    })

    expect(editor.getDoc().nodes[insertedId]).toBeUndefined()
    expect(editor.getState().selectedNodeId).toBeNull()

    act(() => {
      editor.redo()
    })
    expect(editor.getDoc().nodes[insertedId]?.position).not.toBeNull()
  })

  it('deletes non-root subtrees and focuses the parent', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    const grandchildId = editor.addChild(childId)
    editor.select(childId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => {
      result.current.onKeyDown(makeKbEvent('Delete'))
    })

    await Promise.resolve()
    const state = editor.getState()
    expect(state.doc.nodes[childId]).toBeUndefined()
    expect(state.doc.nodes[grandchildId]).toBeUndefined()
    expect(state.selectedNodeId).toBe(doc.rootId)
  })

  it('undo restores a deleted auto-layout subtree in one step', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    const grandchildId = editor.addChild(childId)
    editor.setLayout('tree-horizontal')
    editor.select(childId)
    const exitRef = createRef<(() => void) | null>()
    const { result } = renderHook(() => useKeyboard(editor, exitRef))

    act(() => {
      result.current.onKeyDown(makeKbEvent('Delete'))
    })
    await Promise.resolve()
    expect(editor.getDoc().nodes[childId]).toBeUndefined()

    act(() => {
      editor.undo()
    })

    const restored = editor.getDoc()
    expect(restored.nodes[childId]).toBeDefined()
    expect(restored.nodes[grandchildId]).toBeDefined()
  })

  it('uses the current layout mode when async delete confirmation resolves', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.addChild(childId)
    editor.setLayout('tree-horizontal')
    editor.select(childId)
    const exitRef = createRef<(() => void) | null>()
    let resolveConfirm: ((value: boolean) => void) | null = null
    const confirmDelete = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        }),
    )
    const { result } = renderHook(() =>
      useKeyboard(editor, exitRef, confirmDelete),
    )

    act(() => {
      result.current.onKeyDown(makeKbEvent('Delete'))
    })
    act(() => {
      editor.setLayout('free-float')
    })
    resolveConfirm?.(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(editor.getDoc().nodes[childId]).toBeUndefined()
    expect(editor.getLastTransaction()?.ops.map((op) => op.type)).toEqual([
      'deleteNode',
    ])
  })
})
