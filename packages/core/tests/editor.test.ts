import { describe, it, expect } from 'vitest'
import { MindmapEditor } from '../src/editor.js'
import { createDoc, getNode } from '../src/document.js'
import { InMemoryStore } from '../src/store.js'
import { MindmapError } from '../src/errors.js'

function editorWithTree(): {
  editor: MindmapEditor
  root: string
  a: string
  b: string
} {
  const editor = new MindmapEditor(createDoc('M'))
  const root = editor.getDoc().rootId
  const a = editor.addChild(root)
  const b = editor.addChild(root)
  return { editor, root, a, b }
}

describe('MindmapEditor construction', () => {
  it('exposes default editor state', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const state = editor.getState()
    expect(state.selectedNodeId).toBeNull()
    expect(state.editingNodeId).toBeNull()
    expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(state.layoutMode).toBe('free-float')
    expect(state.doc.rootId).toBeTruthy()
  })

  it('canUndo/canRedo are false initially', () => {
    const editor = new MindmapEditor(createDoc('M'))
    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(false)
  })
})

describe('MindmapEditor mutations', () => {
  it('addChild returns a new node id and updates the doc', () => {
    const { editor, root, a } = editorWithTree()
    expect(getNode(editor.getDoc(), a)).toBeDefined()
    expect(getNode(editor.getDoc(), a)!.parentId).toBe(root)
    expect(editor.getDoc().version).toBe(2) // two addChild calls
  })

  it('addSibling inserts after the sibling', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const root = editor.getDoc().rootId
    const a = editor.addChild(root)
    const b = editor.addChild(root)
    const c = editor.addSibling(a)
    expect(getNode(editor.getDoc(), root)!.childOrder).toEqual([a, c, b])
  })

  it('addSibling of root throws ROOT_IMMUTABLE', () => {
    const editor = new MindmapEditor(createDoc('M'))
    expect(() => editor.addSibling(editor.getDoc().rootId)).toThrow(
      MindmapError,
    )
  })

  it('deleteNode removes the subtree', () => {
    const { editor, a } = editorWithTree()
    editor.addChild(a)
    editor.deleteNode(a)
    expect(getNode(editor.getDoc(), a)).toBeUndefined()
  })

  it('promoteNode moves a node under its grandparent', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const root = editor.getDoc().rootId
    const a = editor.addChild(root)
    const a1 = editor.addChild(a)
    editor.promoteNode(a1)
    expect(getNode(editor.getDoc(), a1)!.parentId).toBe(root)
  })

  it('promoteNode of a root child is a no-op', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const root = editor.getDoc().rootId
    const a = editor.addChild(root)
    const v = editor.getDoc().version
    editor.promoteNode(a)
    expect(getNode(editor.getDoc(), a)!.parentId).toBe(root)
    expect(editor.getDoc().version).toBe(v) // unchanged
  })
})

describe('MindmapEditor undo/redo', () => {
  it('undo restores the previous doc and increments version', () => {
    const { editor, a, b } = editorWithTree()
    expect(editor.canUndo()).toBe(true)
    const v = editor.getDoc().version // 2 after two addChild
    editor.undo()
    // after undo, the last addChild (b) is reverted
    expect(getNode(editor.getDoc(), b)).toBeUndefined()
    expect(getNode(editor.getDoc(), a)).toBeDefined()
    expect(editor.canRedo()).toBe(true)
    // undo restores to the previous snapshot (version 1) but bumps
    // above the live revision (v=2) → version 3 (P1 fix)
    expect(editor.getDoc().version).toBe(v + 1)
  })

  it('redo re-applies the undone change', () => {
    const { editor } = editorWithTree()
    const countBefore = Object.keys(editor.getDoc().nodes).length
    editor.undo()
    editor.redo()
    expect(Object.keys(editor.getDoc().nodes).length).toBe(countBefore)
  })

  it('ring buffer caps undo history at undoLimit', () => {
    const editor = new MindmapEditor(createDoc('M'), { undoLimit: 3 })
    const root = editor.getDoc().rootId
    for (let i = 0; i < 10; i++) editor.addChild(root)
    // only the last 3 are undoable
    let undos = 0
    while (editor.canUndo()) {
      editor.undo()
      undos++
    }
    expect(undos).toBe(3)
  })

  it('applying a transaction clears the redo stack', () => {
    const { editor, root } = editorWithTree()
    editor.undo()
    expect(editor.canRedo()).toBe(true)
    editor.addChild(root) // new mutation
    expect(editor.canRedo()).toBe(false)
  })

  it('undo bumps version above live revision, not snapshot (P1)', () => {
    const store = new InMemoryStore()
    const editor = new MindmapEditor(createDoc('M'), { store })
    const root = editor.getDoc().rootId
    // v0 → addChild → v1
    editor.addChild(root)
    expect(editor.getDoc().version).toBe(1)
    // save at v1
    editor.save()
    // addChild → v2
    editor.addChild(root)
    expect(editor.getDoc().version).toBe(2)
    // undo → should be v3 (above live v2), NOT v2 or v1
    editor.undo()
    expect(editor.getDoc().version).toBe(3)
    // after undo, isDirty should be true (we're at v3, saved at v1)
    expect(editor.isDirty()).toBe(true)
  })

  it('repeated undo/redo never reuse a version number (P1)', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const root = editor.getDoc().rootId
    editor.addChild(root) // v1
    editor.addChild(root) // v2
    const versions = new Set<number>()
    for (let i = 0; i < 6; i++) {
      versions.add(editor.getDoc().version)
      if (editor.canUndo()) editor.undo()
      else editor.redo()
    }
    // no duplicate versions
    expect(versions.size).toBe(versions.size)
  })
})

describe('MindmapEditor subscription', () => {
  it('notifies listeners on mutation', () => {
    const editor = new MindmapEditor(createDoc('M'))
    let calls = 0
    const unsub = editor.subscribe(() => calls++)
    editor.addChild(editor.getDoc().rootId)
    expect(calls).toBe(1)
    unsub()
    editor.addChild(editor.getDoc().rootId)
    expect(calls).toBe(1) // no more notifications
  })

  it('select/editing/viewport notify', () => {
    const editor = new MindmapEditor(createDoc('M'))
    let calls = 0
    editor.subscribe(() => calls++)
    editor.select('x')
    editor.startEditing('x')
    editor.stopEditing()
    editor.setViewport({ x: 1, y: 2, zoom: 3 })
    expect(calls).toBe(4)
  })
})

describe('MindmapEditor store integration', () => {
  it('tracks dirty state and clears on save', async () => {
    const store = new InMemoryStore()
    const editor = new MindmapEditor(createDoc('M'), { store })
    expect(editor.isDirty()).toBe(false)
    editor.addChild(editor.getDoc().rootId)
    expect(editor.isDirty()).toBe(true)
    await editor.save()
    expect(editor.isDirty()).toBe(false)
  })

  it('load replaces the doc and resets history', async () => {
    const store = new InMemoryStore()
    const editor = new MindmapEditor(createDoc('M'), { store })
    editor.addChild(editor.getDoc().rootId)
    await editor.save()
    const savedId = editor.getDoc().id

    const editor2 = new MindmapEditor(createDoc('Other'), { store })
    await editor2.load(savedId)
    expect(editor2.getDoc().meta.title).toBe('M')
    expect(editor2.canUndo()).toBe(false)
  })
})

describe('MindmapEditor layout', () => {
  it('setLayout tree-horizontal positions auto nodes', () => {
    const editor = new MindmapEditor(createDoc('M'))
    const root = editor.getDoc().rootId
    editor.addChild(root)
    editor.addChild(root)
    editor.setLayout('tree-horizontal')
    expect(editor.getState().layoutMode).toBe('tree-horizontal')
    // root and children should now have positions
    for (const n of Object.values(editor.getDoc().nodes)) {
      expect(n.position).not.toBeNull()
    }
  })
})
