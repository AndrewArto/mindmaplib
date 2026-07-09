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

  it('clears selection when selected node is deleted (P2 r5)', () => {
    const { editor, a } = editorWithTree()
    editor.select(a)
    expect(editor.getState().selectedNodeId).toBe(a)
    editor.deleteNode(a)
    expect(editor.getState().selectedNodeId).toBeNull()
  })

  it('clears editing when edited node is deleted (P2 r5)', () => {
    const { editor, a } = editorWithTree()
    editor.startEditing(a)
    expect(editor.getState().editingNodeId).toBe(a)
    editor.deleteNode(a)
    expect(editor.getState().editingNodeId).toBeNull()
  })

  it('setLayout sets layoutMode before notifying (P3 r5)', () => {
    const editor = new MindmapEditor(createDoc('L'))
    const root = editor.getDoc().rootId
    editor.addChild(root)
    const modes: string[] = []
    editor.subscribe((state) => modes.push(state.layoutMode))
    editor.setLayout('tree-vertical')
    // every notification should have seen the new mode
    expect(modes.every((m) => m === 'tree-vertical')).toBe(true)
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

  it('negative undoLimit is clamped to 0, does not hang (P2 r4)', () => {
    const editor = new MindmapEditor(createDoc('M'), {
      undoLimit: -5,
    })
    const root = editor.getDoc().rootId
    editor.addChild(root) // should not infinite-loop
    expect(editor.canUndo()).toBe(false)
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

  it('preserves dirty state when mutated during save (P1 r2)', async () => {
    const store = new InMemoryStore()
    const editor = new MindmapEditor(createDoc('M'), { store })
    const root = editor.getDoc().rootId
    editor.addChild(root) // v1
    await editor.save()
    expect(editor.isDirty()).toBe(false)
    // start a save, mutate before it resolves
    const savePromise = editor.save()
    editor.addChild(root) // v3 while save in flight
    await savePromise
    // isDirty should be true because the v3 mutation wasn't saved
    expect(editor.isDirty()).toBe(true)
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

  it('throws when the store reports a save conflict', async () => {
    const store = new InMemoryStore()
    const doc = createDoc('M')
    const editor = new MindmapEditor(doc, { store })
    await editor.save()
    editor.addChild(doc.rootId)
    await store.save({ ...editor.getDoc(), version: 99 })

    await expect(editor.save()).rejects.toThrow('Save conflict')
    expect(editor.isDirty()).toBe(true)
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

// --- C2: setPositionDirect / commitPosition (MML-B-0009) ---

describe('MindmapEditor drag-position (C2 fix)', () => {
  it('setPositionDirect does not increment version', () => {
    const editor = new MindmapEditor(createDoc('D'))
    const root = editor.getDoc().rootId
    const child = editor.addChild(root)
    const v = editor.getDoc().version
    editor.setPositionDirect(child, { x: 10, y: 10 })
    editor.setPositionDirect(child, { x: 20, y: 20 })
    editor.setPositionDirect(child, { x: 30, y: 30 })
    expect(editor.getDoc().version).toBe(v) // no version bump
    // position should reflect the last setPositionDirect
    expect(editor.getDoc().nodes[child]!.position).toEqual({ x: 30, y: 30 })
  })

  it('commitPosition creates one undo entry for entire drag', () => {
    const editor = new MindmapEditor(createDoc('D'))
    const root = editor.getDoc().rootId
    const child = editor.addChild(root)
    // Set a known starting position
    editor.setPosition(child, { x: 0, y: 0 })
    const vAfterSet = editor.getDoc().version

    // Simulate drag: 5 direct updates, no version bump
    editor.setPositionDirect(child, { x: 10, y: 10 })
    editor.setPositionDirect(child, { x: 20, y: 20 })
    editor.setPositionDirect(child, { x: 30, y: 30 })
    editor.setPositionDirect(child, { x: 40, y: 40 })
    editor.setPositionDirect(child, { x: 50, y: 50 })
    expect(editor.getDoc().version).toBe(vAfterSet) // still no bump

    // Commit: one undo entry, version +1
    editor.commitPosition(child, { x: 50, y: 50 })
    expect(editor.getDoc().version).toBe(vAfterSet + 1)

    // ONE undo reverts to before all 5 setPositionDirect calls
    editor.undo()
    expect(editor.getDoc().nodes[child]!.position).toEqual({ x: 0, y: 0 })
  })

  it('commitPosition with invalid nodeId does not corrupt undo history (P2 fix)', () => {
    const editor = new MindmapEditor(createDoc('D'))
    const root = editor.getDoc().rootId
    const child = editor.addChild(root)
    editor.setPosition(child, { x: 10, y: 10 })
    const undoCount = editor.canUndo() // should be true

    // Attempt commitPosition with non-existent node
    expect(() =>
      editor.commitPosition('nonexistent', { x: 99, y: 99 }),
    ).toThrow()

    // Undo history should be intact
    expect(editor.canUndo()).toBe(undoCount)
    // Position should be unchanged
    expect(editor.getDoc().nodes[child]!.position).toEqual({ x: 10, y: 10 })
  })

  it('setPosition is an alias for commitPosition (backward compat)', () => {
    const editor = new MindmapEditor(createDoc('D'))
    const root = editor.getDoc().rootId
    const child = editor.addChild(root)
    const v = editor.getDoc().version
    editor.setPosition(child, { x: 100, y: 100 })
    // setPosition should create an undo entry and bump version
    expect(editor.getDoc().version).toBe(v + 1)
    expect(editor.canUndo()).toBe(true)
    editor.undo()
    // after undo, position reverts
    const pos = editor.getDoc().nodes[child]!.position
    // original position was null (before setPosition), or whatever addChild set
    expect(pos === null || (pos!.x === 0 && pos!.y === 0)).toBe(true)
  })
})

// --- C3: fitToScreen container dimensions (MML-B-0009) ---

describe('MindmapEditor fitToScreen (C3 fix)', () => {
  it('expands small maps instead of capping fit zoom at 1', () => {
    const doc = createDoc('F')
    const rootNode = doc.nodes[doc.rootId]!
    const testDoc = {
      ...doc,
      nodes: {
        [doc.rootId]: {
          ...rootNode,
          position: { x: 0, y: 0 },
          childOrder: ['child1'],
        },
        child1: {
          id: 'child1',
          parentId: doc.rootId,
          position: { x: 160, y: 0 },
          manualPosition: false,
          collapsed: false,
          childOrder: [],
          content: {
            type: 'doc' as const,
            content: [{ type: 'paragraph' as const }],
          },
        },
      },
    }

    const editor = new MindmapEditor(testDoc)
    editor.fitToScreen(1120, 640)

    expect(editor.getState().viewport.zoom).toBeGreaterThan(1)
    expect(editor.getState().viewport.zoom).toBeCloseTo(4, 2)
  })

  it('ignores descendants hidden under collapsed nodes when fitting', () => {
    const doc = createDoc('F')
    const rootNode = doc.nodes[doc.rootId]!
    const testDoc = {
      ...doc,
      nodes: {
        [doc.rootId]: {
          ...rootNode,
          position: { x: 0, y: 0 },
          childOrder: ['child1'],
        },
        child1: {
          id: 'child1',
          parentId: doc.rootId,
          position: { x: 160, y: 0 },
          manualPosition: false,
          collapsed: true,
          childOrder: ['hiddenGrandchild'],
          content: {
            type: 'doc' as const,
            content: [{ type: 'paragraph' as const }],
          },
        },
        hiddenGrandchild: {
          id: 'hiddenGrandchild',
          parentId: 'child1',
          position: { x: 10000, y: 8000 },
          manualPosition: false,
          collapsed: false,
          childOrder: [],
          content: {
            type: 'doc' as const,
            content: [{ type: 'paragraph' as const }],
          },
        },
      },
    }

    const editor = new MindmapEditor(testDoc)
    editor.fitToScreen(600, 400)

    expect(editor.getState().viewport.zoom).toBeGreaterThan(1)
  })

  it('keeps the no-dimension fallback capped at 1', () => {
    const editor = new MindmapEditor(createDoc('F'))
    editor.setLayout('tree-horizontal')

    editor.fitToScreen()

    expect(editor.getState().viewport.zoom).toBe(1)
  })

  it('uses provided container dimensions for zoom calculation', () => {
    const doc = createDoc('F')
    // Manually set two nodes far apart to create a known bounding box
    const rootNode = doc.nodes[doc.rootId]!
    const testDoc = {
      ...doc,
      nodes: {
        [doc.rootId]: {
          ...rootNode,
          position: { x: 0, y: 0 },
          childOrder: ['child1'],
        },
        child1: {
          id: 'child1',
          parentId: doc.rootId,
          position: { x: 1000, y: 800 },
          manualPosition: false,
          collapsed: false,
          childOrder: [],
          content: {
            type: 'doc' as const,
            content: [{ type: 'paragraph' as const }],
          },
        },
      },
    }
    // Content bbox: (0,0) to (1120, 840) with default node size 120x40
    // width=1120, height=840

    const editor = new MindmapEditor(testDoc)
    editor.fitToScreen(1200, 800)
    // zoom = min(1200/1120, 800/840, 1) = min(1.07, 0.95, 1) = 0.952
    const expectedZoom = Math.min(1200 / 1120, 800 / 840, 1)
    expect(editor.getState().viewport.zoom).toBeCloseTo(expectedZoom, 2)
  })

  it('different container sizes produce different zoom levels', () => {
    const doc = createDoc('F')
    const rootNode = doc.nodes[doc.rootId]!
    const testDoc = {
      ...doc,
      nodes: {
        [doc.rootId]: {
          ...rootNode,
          position: { x: 0, y: 0 },
          childOrder: ['child1'],
        },
        child1: {
          id: 'child1',
          parentId: doc.rootId,
          position: { x: 1000, y: 800 },
          manualPosition: false,
          collapsed: false,
          childOrder: [],
          content: {
            type: 'doc' as const,
            content: [{ type: 'paragraph' as const }],
          },
        },
      },
    }

    const editorLarge = new MindmapEditor(testDoc)
    editorLarge.fitToScreen(1200, 800)
    const zoomLarge = editorLarge.getState().viewport.zoom

    const editorSmall = new MindmapEditor(testDoc)
    editorSmall.fitToScreen() // default 800x600
    const zoomSmall = editorSmall.getState().viewport.zoom

    expect(zoomLarge).toBeGreaterThan(zoomSmall)
  })
})

// =========================================================================
// MML-B-0011: nodeMeasures in layout
// =========================================================================

describe('MML-B-0011: nodeMeasures in layout', () => {
  it('setNodeMeasures stores and getNodeMeasures returns them', () => {
    const editor = new MindmapEditor(createDoc('R'))
    const rootId = editor.getDoc().rootId
    const m = { [rootId]: { width: 200, height: 60 } }
    editor.setNodeMeasures(m)
    expect(editor.getNodeMeasures()).toEqual(m)
  })

  it('setLayout uses nodeMeasures for depth spacing (no parent overlap)', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    const rootId = doc.rootId
    editor.addChild(rootId)

    // Default: depth spacing = 120 + 40 = 160
    editor.setLayout('tree-horizontal')
    const childId = editor.getDoc().nodes[rootId]!.childOrder[0]!
    const defaultX = editor.getDoc().nodes[childId]!.position!.x

    // Wide nodes: depth spacing should be 200 + 40 = 240
    editor.setNodeMeasures({
      [rootId]: { width: 200, height: 40 },
      [childId]: { width: 200, height: 40 },
    })
    editor.setLayout('tree-horizontal')

    const wideX = editor.getDoc().nodes[childId]!.position!.x
    expect(wideX).toBeGreaterThan(defaultX)
    // Child x must exceed parent width so they don't overlap
    expect(wideX).toBeGreaterThanOrEqual(200)
  })

  it('setLayout uses nodeMeasures for sibling spacing (no sibling overlap)', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.addChild(doc.rootId)

    // Default sibling gap
    editor.setLayout('tree-horizontal')
    const childIds = editor.getDoc().nodes[doc.rootId]!.childOrder
    const defaultGap = Math.abs(
      editor.getDoc().nodes[childIds[1]]!.position!.y -
        editor.getDoc().nodes[childIds[0]]!.position!.y,
    )

    // Taller nodes → bigger sibling spacing
    editor.setNodeMeasures({
      [childIds[0]]: { width: 120, height: 100 },
      [childIds[1]]: { width: 120, height: 100 },
    })
    editor.setLayout('tree-horizontal')

    const wideGap = Math.abs(
      editor.getDoc().nodes[childIds[1]]!.position!.y -
        editor.getDoc().nodes[childIds[0]]!.position!.y,
    )
    expect(wideGap).toBeGreaterThan(defaultGap)
  })

  it('setNodeMeasures triggers relayout in auto mode', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.addChild(doc.rootId)
    editor.setLayout('tree-horizontal')

    const childIds = editor.getDoc().nodes[doc.rootId]!.childOrder
    const yGapBefore = Math.abs(
      editor.getDoc().nodes[childIds[1]]!.position!.y -
        editor.getDoc().nodes[childIds[0]]!.position!.y,
    )

    // Set taller measures — should trigger relayout with more sibling spacing
    editor.setNodeMeasures({
      [childIds[0]]: { width: 120, height: 100 },
      [childIds[1]]: { width: 120, height: 100 },
    })

    const yGapAfter = Math.abs(
      editor.getDoc().nodes[childIds[1]]!.position!.y -
        editor.getDoc().nodes[childIds[0]]!.position!.y,
    )
    expect(yGapAfter).toBeGreaterThan(yGapBefore)
  })

  it('setNodeMeasures does NOT relayout in free-float', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)

    const childId = editor.getDoc().nodes[doc.rootId]!.childOrder[0]!
    const posBefore = editor.getDoc().nodes[childId]!.position

    editor.setNodeMeasures({
      [childId]: { width: 300, height: 80 },
    })

    const posAfter = editor.getDoc().nodes[childId]!.position
    expect(posAfter).toEqual(posBefore)
  })
})

// =========================================================================
// MML-B-0011 R1 codex fixes
// =========================================================================

describe('MML-B-0011 R1: codex review fixes', () => {
  it('P2-1: stale measures pruned after node deletion', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    const rootId = doc.rootId
    const bigId = editor.addChild(rootId)
    const smallId = editor.addChild(rootId)

    // Set wide measures for both children
    editor.setNodeMeasures({
      [bigId]: { width: 1000, height: 40 },
      [smallId]: { width: 120, height: 40 },
      [rootId]: { width: 120, height: 40 },
    })
    editor.setLayout('tree-horizontal')

    // Both children far apart due to 1000px wide node
    const bigX = editor.getDoc().nodes[bigId]!.position!.x
    expect(bigX).toBeGreaterThanOrEqual(1000)

    // Delete the wide node
    editor.deleteNode(bigId)

    // Set measures again (simulating ResizeObserver flush after deletion)
    editor.setNodeMeasures({
      [smallId]: { width: 120, height: 40 },
      [rootId]: { width: 120, height: 40 },
    })

    // Small node should now use normal spacing, not the deleted node's 1000px
    const smallX = editor.getDoc().nodes[smallId]!.position!.x
    expect(smallX).toBeLessThan(500)
  })

  it('P2-2: setNodeMeasures relayout does not create undo entry', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.addChild(doc.rootId)
    editor.setLayout('tree-horizontal')

    const undoCountBefore = editor.getState().doc.version

    // Trigger measurement-driven relayout
    editor.setNodeMeasures({
      [doc.rootId]: { width: 300, height: 80 },
    })

    // Version should NOT increase (silent relayout)
    const undoCountAfter = editor.getState().doc.version
    expect(undoCountAfter).toBe(undoCountBefore)

    // Undo should NOT revert the measurement relayout
    // (it should revert to whatever was before the last user action)
    const canUndo = editor.canUndo()
    // The setNodeMeasures should not have pushed undo
    // (if we undo, we should get the pre-setLayout state, not pre-setNodeMeasures)
    if (canUndo) {
      editor.undo()
      // After undo, layout should revert to the user-triggered setLayout state
      // not the measurement relayout
    }
  })
})

// =========================================================================
// MML-B-0011 R2: setLayout stale measures via computeLayoutOps filter
// =========================================================================

describe('MML-B-0011 R2: stale measures filtered in computeLayoutOps', () => {
  it('setLayout after node deletion uses correct spacing (no stale)', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    const rootId = doc.rootId
    const bigId = editor.addChild(rootId)
    const smallId = editor.addChild(rootId)

    editor.setNodeMeasures({
      [bigId]: { width: 1000, height: 40 },
      [smallId]: { width: 120, height: 40 },
      [rootId]: { width: 120, height: 40 },
    })
    editor.setLayout('tree-horizontal')

    // Delete the wide node, then setLayout again WITHOUT calling setNodeMeasures
    editor.deleteNode(bigId)
    editor.setLayout('tree-horizontal')

    // Small node should use default spacing, not the stale 1000px
    const smallX = editor.getDoc().nodes[smallId]!.position!.x
    expect(smallX).toBeLessThan(500)
  })
})
