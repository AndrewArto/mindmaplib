import { describe, it, expect } from 'vitest'
import {
  createDoc,
  getNode,
  getChildren,
  getDescendants,
  getPath,
  getAncestors,
  addNode,
  deleteNode,
  moveNode,
  updateNodeContent,
  setNodePosition,
  resetManualPosition,
  toggleNodeCollapsed,
} from '../src/document.js'
import { MindmapError } from '../src/errors.js'
import { emptyContent } from '../src/content.js'
import type { MindmapDoc } from '../src/types.js'

/** Add a child and recover its generated id via childOrder diff. */
function addChild(
  doc: MindmapDoc,
  parentId: string,
  opts?: { insertAfter?: string | null },
): { doc: MindmapDoc; nodeId: string } {
  const before = getNode(doc, parentId)?.childOrder ?? []
  const next = addNode(doc, parentId, opts)
  const after = getNode(next, parentId)?.childOrder ?? []
  const newId = after.find((id) => !before.includes(id))
  if (!newId) throw new Error('test helper: could not find new node id')
  return { doc: next, nodeId: newId }
}

function buildSample(): {
  doc: MindmapDoc
  root: string
  a: string
  b: string
  a1: string
} {
  let doc = createDoc('Sample')
  const root = doc.rootId
  let r = addChild(doc, root)
  doc = r.doc
  const a = r.nodeId
  r = addChild(doc, root)
  doc = r.doc
  const b = r.nodeId
  r = addChild(doc, a)
  doc = r.doc
  const a1 = r.nodeId
  return { doc, root, a, b, a1 }
}

describe('createDoc', () => {
  it('creates a doc with a root node and correct metadata', () => {
    const doc = createDoc('My Map')
    expect(doc.meta.title).toBe('My Map')
    expect(doc.version).toBe(0)
    expect(doc.rootId).toBeTruthy()
    const root = doc.nodes[doc.rootId]!
    expect(root).toBeDefined()
    expect(root.parentId).toBeNull()
    expect(root.childOrder).toEqual([])
    expect(root.collapsed).toBe(false)
    expect(root.manualPosition).toBe(false)
    expect(root.position).toBeNull()
    expect(root.content).toEqual(emptyContent())
  })

  it('sets created and updated to ISO 8601 timestamps', () => {
    const doc = createDoc('T')
    expect(doc.meta.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(doc.meta.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('has exactly one node (the root)', () => {
    const doc = createDoc('One')
    expect(Object.keys(doc.nodes)).toHaveLength(1)
  })
})

describe('queries', () => {
  it('getNode returns the node or undefined', () => {
    const { doc, a } = buildSample()
    expect(getNode(doc, a)).toBeDefined()
    expect(getNode(doc, 'nope')).toBeUndefined()
  })

  it('getChildren returns nodes ordered per childOrder', () => {
    const { doc, root, a, b } = buildSample()
    const children = getChildren(doc, root)
    expect(children.map((n) => n.id)).toEqual([a, b])
  })

  it('getDescendants returns all descendants', () => {
    const { doc, root, a, b, a1 } = buildSample()
    const ids = getDescendants(doc, root).map((n) => n.id)
    expect(ids).toContain(a)
    expect(ids).toContain(b)
    expect(ids).toContain(a1)
    expect(ids).not.toContain(root)
    expect(ids).toHaveLength(3)
  })

  it('getPath returns root → node', () => {
    const { doc, root, a, a1 } = buildSample()
    expect(getPath(doc, a1).map((n) => n.id)).toEqual([root, a, a1])
  })

  it('getPath of root is just [root]', () => {
    const { doc, root } = buildSample()
    expect(getPath(doc, root).map((n) => n.id)).toEqual([root])
  })

  it('getAncestors returns node → root (excluding the node)', () => {
    const { doc, root, a, a1 } = buildSample()
    expect(getAncestors(doc, a1).map((n) => n.id)).toEqual([a, root])
    expect(getAncestors(doc, a).map((n) => n.id)).toEqual([root])
    expect(getAncestors(doc, root)).toEqual([])
  })
})

describe('addNode', () => {
  it('adds a child and updates parent childOrder', () => {
    const doc = createDoc('D')
    const root = doc.rootId
    const { doc: next, nodeId } = addChild(doc, root)
    expect(getNode(next, nodeId)).toBeDefined()
    expect(getNode(next, nodeId)!.parentId).toBe(root)
    expect(getNode(next, root)!.childOrder).toEqual([nodeId])
  })

  it('increments the document version', () => {
    const doc = createDoc('D')
    expect(doc.version).toBe(0)
    const next = addNode(doc, doc.rootId)
    expect(next.version).toBe(1)
  })

  it('preserves immutability and structural sharing', () => {
    const doc = createDoc('D')
    const root = doc.rootId
    // add a first child so we have an unchanged node to check sharing on
    const { doc: d1, nodeId: first } = addChild(doc, root)
    const next = addNode(d1, root)
    expect(next).not.toBe(d1)
    expect(Object.keys(d1.nodes)).toHaveLength(2)
    expect(Object.keys(next.nodes)).toHaveLength(3)
    // unchanged node (first child) keeps its reference
    expect(d1.nodes[first]).toBe(next.nodes[first])
    // changed node (root, whose childOrder changed) gets a new reference
    expect(d1.nodes[root]).not.toBe(next.nodes[root])
  })

  it('appends multiple children in insertion order', () => {
    const doc = createDoc('D')
    const root = doc.rootId
    const { doc: d1, nodeId: a } = addChild(doc, root)
    const { doc: d2 } = addChild(d1, root)
    expect(getNode(d2, root)!.childOrder).toHaveLength(2)
    expect(getNode(d2, root)!.childOrder[0]).toBe(a)
  })

  it('respects insertAfter ordering', () => {
    const doc = createDoc('D')
    const root = doc.rootId
    const { doc: d1, nodeId: a } = addChild(doc, root)
    const { doc: d2, nodeId: b } = addChild(d1, root)
    const { doc: d3, nodeId: c } = addChild(d2, root, { insertAfter: a })
    expect(getNode(d3, root)!.childOrder).toEqual([a, c, b])
  })

  it('insertAfter null inserts at the beginning', () => {
    const doc = createDoc('D')
    const root = doc.rootId
    const { doc: d1, nodeId: a } = addChild(doc, root)
    const { doc: d2, nodeId: b } = addChild(d1, root)
    const { doc: d3, nodeId: c } = addChild(d2, root, { insertAfter: null })
    expect(getNode(d3, root)!.childOrder).toEqual([c, a, b])
  })

  it('throws NODE_NOT_FOUND when parent does not exist', () => {
    const doc = createDoc('D')
    expect(() => addNode(doc, 'missing')).toThrow(MindmapError)
    try {
      addNode(doc, 'missing')
    } catch (e) {
      expect((e as MindmapError).code).toBe('NODE_NOT_FOUND')
    }
  })
})

describe('deleteNode', () => {
  it('removes the node and its entire subtree', () => {
    const { doc, root, a, b, a1 } = buildSample()
    const next = deleteNode(doc, a)
    expect(getNode(next, a)).toBeUndefined()
    expect(getNode(next, a1)).toBeUndefined()
    expect(getNode(next, b)).toBeDefined()
    expect(getNode(next, root)!.childOrder).toEqual([b])
  })

  it('throws ROOT_IMMUTABLE when deleting root', () => {
    const { doc } = buildSample()
    expect(() => deleteNode(doc, doc.rootId)).toThrow(MindmapError)
    try {
      deleteNode(doc, doc.rootId)
    } catch (e) {
      expect((e as MindmapError).code).toBe('ROOT_IMMUTABLE')
    }
  })

  it('throws NODE_NOT_FOUND when node missing', () => {
    const { doc } = buildSample()
    expect(() => deleteNode(doc, 'missing')).toThrow(MindmapError)
  })
})

describe('moveNode', () => {
  it('reparents and updates childOrder on old and new parent', () => {
    const { doc, root, a, b, a1 } = buildSample()
    const next = moveNode(doc, b, a)
    expect(getNode(next, b)!.parentId).toBe(a)
    expect(getNode(next, root)!.childOrder).toEqual([a])
    expect(getNode(next, a)!.childOrder).toEqual([a1, b])
  })

  it('throws CYCLE_DETECTED when moving under a descendant', () => {
    const { doc, a, a1 } = buildSample()
    expect(() => moveNode(doc, a, a1)).toThrow(MindmapError)
    try {
      moveNode(doc, a, a1)
    } catch (e) {
      expect((e as MindmapError).code).toBe('CYCLE_DETECTED')
    }
  })

  it('throws ROOT_IMMUTABLE when moving root', () => {
    const { doc, a } = buildSample()
    expect(() => moveNode(doc, doc.rootId, a)).toThrow(MindmapError)
    try {
      moveNode(doc, doc.rootId, a)
    } catch (e) {
      expect((e as MindmapError).code).toBe('ROOT_IMMUTABLE')
    }
  })

  it('throws NODE_NOT_FOUND when target missing', () => {
    const { doc, a } = buildSample()
    expect(() => moveNode(doc, a, 'missing')).toThrow(MindmapError)
  })

  it('respects insertAfter on the new parent', () => {
    const { doc, root, a, b } = buildSample()
    const { doc: d1, nodeId: c } = addChild(doc, root)
    // move c after a under root
    const next = moveNode(d1, c, root, a)
    expect(getNode(next, root)!.childOrder).toEqual([a, c, b])
  })
})

describe('updateNodeContent', () => {
  it('replaces content and normalizes it', () => {
    const { doc, a } = buildSample()
    const content = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'Hello' }],
        },
      ],
    }
    const next = updateNodeContent(doc, a, content)
    const block = getNode(next, a)!.content.content[0]
    expect(block.type).toBe('paragraph')
  })

  it('strips disallowed marks during normalization', () => {
    const { doc, a } = buildSample()
    const content = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            { type: 'text' as const, text: 'x', marks: [{ type: 'strike' }] },
          ],
        },
      ],
    }
    const next = updateNodeContent(doc, a, content)
    const inline = getNode(next, a)!.content.content[0].content![0]
    expect(inline.marks ?? []).toHaveLength(0)
  })

  it('increments version', () => {
    const { doc, a } = buildSample()
    const v0 = doc.version
    const next = updateNodeContent(doc, a, emptyContent())
    expect(next.version).toBe(v0 + 1)
  })

  it('throws NODE_NOT_FOUND for missing node', () => {
    const { doc } = buildSample()
    expect(() => updateNodeContent(doc, 'missing', emptyContent())).toThrow(
      MindmapError,
    )
  })
})

describe('setNodePosition', () => {
  it('sets coordinates and manualPosition=true', () => {
    const { doc, a } = buildSample()
    const next = setNodePosition(doc, a, { x: 10, y: 20 })
    const node = getNode(next, a)!
    expect(node.position).toEqual({ x: 10, y: 20 })
    expect(node.manualPosition).toBe(true)
  })

  it('throws INVALID_POSITION for non-finite numbers', () => {
    const { doc, a } = buildSample()
    expect(() => setNodePosition(doc, a, { x: NaN, y: 20 })).toThrow(
      MindmapError,
    )
    expect(() => setNodePosition(doc, a, { x: 10, y: Infinity })).toThrow(
      MindmapError,
    )
    try {
      setNodePosition(doc, a, { x: NaN, y: 20 })
    } catch (e) {
      expect((e as MindmapError).code).toBe('INVALID_POSITION')
    }
  })
})

describe('resetManualPosition', () => {
  it('sets manualPosition=false and position=null', () => {
    const { doc, a } = buildSample()
    const placed = setNodePosition(doc, a, { x: 1, y: 1 })
    const reset = resetManualPosition(placed, a)
    const node = getNode(reset, a)!
    expect(node.manualPosition).toBe(false)
    expect(node.position).toBeNull()
  })
})

describe('toggleNodeCollapsed', () => {
  it('flips the collapsed flag', () => {
    const { doc, a } = buildSample()
    expect(getNode(doc, a)!.collapsed).toBe(false)
    const next = toggleNodeCollapsed(doc, a)
    expect(getNode(next, a)!.collapsed).toBe(true)
    const next2 = toggleNodeCollapsed(next, a)
    expect(getNode(next2, a)!.collapsed).toBe(false)
  })
})
