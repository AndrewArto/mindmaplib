import { describe, it, expect } from 'vitest'
import { computeLayoutOps } from '../src/layout.js'
import { createDoc, addNode, getNode } from '../src/document.js'
import type { MindmapDoc } from '../src/types.js'

function findNewId(
  before: MindmapDoc,
  after: MindmapDoc,
  parentId: string,
): string {
  const beforeOrder = getNode(before, parentId)?.childOrder ?? []
  const afterOrder = getNode(after, parentId)?.childOrder ?? []
  return afterOrder.find((id) => !beforeOrder.includes(id))!
}

describe('computeLayoutOps', () => {
  it('returns no ops for free-float', () => {
    const doc = createDoc('F')
    expect(computeLayoutOps(doc, 'free-float')).toEqual([])
  })

  it('produces layoutPosition ops for tree-horizontal', () => {
    let doc = createDoc('T')
    const root = doc.rootId
    doc = addNode(doc, root)
    doc = addNode(doc, root)
    const ops = computeLayoutOps(doc, 'tree-horizontal')
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.every((o) => o.type === 'layoutPosition')).toBe(true)
  })

  it('excludes manually positioned nodes', () => {
    let doc = createDoc('M')
    const root = doc.rootId
    doc = addNode(doc, root)
    // find the child and set it manual
    const childId = doc.nodes[root].childOrder[0]!
    const child = doc.nodes[childId]!
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [childId]: { ...child, manualPosition: true, position: { x: 0, y: 0 } },
      },
    }
    const ops = computeLayoutOps(doc, 'tree-vertical')
    const opNodeIds = ops.map((o) => ('nodeId' in o ? o.nodeId : null))
    expect(opNodeIds).not.toContain(childId)
  })

  it('treats collapsed nodes as leaves', () => {
    let doc = createDoc('C')
    const root = doc.rootId
    const before = doc
    doc = addNode(doc, root)
    const a = findNewId(before, doc, root)
    // add a grandchild under a
    const before2 = doc
    doc = addNode(doc, a)
    const a1 = findNewId(before2, doc, a)
    // collapse a
    const aNode = doc.nodes[a]!
    doc = {
      ...doc,
      nodes: { ...doc.nodes, [a]: { ...aNode, collapsed: true } },
    }
    const ops = computeLayoutOps(doc, 'tree-vertical')
    const ids = ops.map((o) => ('nodeId' in o ? o.nodeId : null))
    // a1 (descendant of collapsed a) should NOT be positioned
    expect(ids).not.toContain(a1)
  })

  it('radial spaces levels by per-depth distance, not total (P2 r2)', () => {
    let doc = createDoc('R')
    const root = doc.rootId
    doc = addNode(doc, root) // child
    const child = doc.nodes[root].childOrder[0]!
    doc = addNode(doc, child) // grandchild
    const ops = computeLayoutOps(doc, 'radial', { spacingY: 20 })
    // root at radius 0, child at ~depthW, grandchild at ~2*depthW
    const childOp = ops.find((o) => 'nodeId' in o && o.nodeId === child)
    const gcOp = ops.find(
      (o) => 'nodeId' in o && o.nodeId === doc.nodes[child].childOrder[0],
    )
    const childR = childOp
      ? Math.hypot(childOp.position.x, childOp.position.y)
      : -1
    const gcR = gcOp ? Math.hypot(gcOp.position.x, gcOp.position.y) : -1
    // grandchild radius should be roughly 2x child radius (per-depth spacing)
    expect(gcR).toBeGreaterThan(childR * 1.5)
  })

  it('produces ops for all three auto-layout modes', () => {
    let doc = createDoc('A')
    doc = addNode(doc, doc.rootId)
    doc = addNode(doc, doc.rootId)
    for (const mode of [
      'tree-horizontal',
      'tree-vertical',
      'radial',
    ] as const) {
      const ops = computeLayoutOps(doc, mode)
      expect(ops.length).toBe(3) // root + 2 children
    }
  })
})
