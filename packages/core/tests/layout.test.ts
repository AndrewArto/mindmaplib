import { describe, it, expect } from 'vitest'
import { computeLayoutOps } from '../src/layout.js'
import { createDoc, addNode, getNode } from '../src/document.js'
import type { MindmapDoc, Position } from '../src/types.js'

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

  // --- C1: Radial layout no-overlap (MML-B-0009) ---

  /**
   * Build a 3-level tree: 1 root -> 4 children -> 3 grandchildren each (12 leaves).
   */
  function buildRadialTestTree(): {
    doc: MindmapDoc
    root: string
    childIds: string[]
  } {
    let doc = createDoc('C1')
    const root = doc.rootId
    const childIds: string[] = []
    for (let i = 0; i < 4; i++) {
      const before = doc
      doc = addNode(doc, root)
      childIds.push(findNewId(before, doc, root))
    }
    for (const childId of childIds) {
      for (let i = 0; i < 3; i++) {
        doc = addNode(doc, childId)
      }
    }
    return { doc, root, childIds }
  }

  it('radial: depth-1 nodes do not overlap with 4 children (C1 fix)', () => {
    const { doc, childIds } = buildRadialTestTree()
    const nodeWidth = 160
    const ops = computeLayoutOps(doc, 'radial', {
      defaultNodeSize: { width: nodeWidth, height: 40 },
      spacingX: 40,
      spacingY: 20,
    })
    const posMap = new Map<string, Position>()
    for (const op of ops) {
      if ('nodeId' in op) posMap.set(op.nodeId, op.position)
    }
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        const p1 = posMap.get(childIds[i]!)
        const p2 = posMap.get(childIds[j]!)
        expect(p1).toBeDefined()
        expect(p2).toBeDefined()
        const dist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
        expect(dist).toBeGreaterThanOrEqual(nodeWidth)
      }
    }
  })

  it('radial: root is at center (C1 fix)', () => {
    const { doc, root } = buildRadialTestTree()
    const ops = computeLayoutOps(doc, 'radial')
    const rootOp = ops.find((o) => 'nodeId' in o && o.nodeId === root) as
      { position: Position } | undefined
    expect(rootOp).toBeDefined()
    const r = Math.hypot(rootOp!.position.x, rootOp!.position.y)
    expect(r).toBeLessThan(1)
  })

  it('radial: flat root with 4 children, no endpoints share angle (P1 fix)', () => {
    // 1 root -> 4 children, no grandchildren. This is the edge case where
    // d3 produces x values at symmetric positions that could wrap around.
    let doc = createDoc('P1')
    const root = doc.rootId
    const childIds: string[] = []
    for (let i = 0; i < 4; i++) {
      const before = doc
      doc = addNode(doc, root)
      childIds.push(findNewId(before, doc, root))
    }
    const ops = computeLayoutOps(doc, 'radial', {
      defaultNodeSize: { width: 160, height: 40 },
      spacingX: 40,
      spacingY: 20,
    })
    const posMap = new Map<string, Position>()
    for (const op of ops) {
      if ('nodeId' in op) posMap.set(op.nodeId, op.position)
    }
    // No two depth-1 children at the same position
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        const p1 = posMap.get(childIds[i]!)
        const p2 = posMap.get(childIds[j]!)
        expect(p1).toBeDefined()
        expect(p2).toBeDefined()
        const dist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
        expect(dist).toBeGreaterThanOrEqual(100)
      }
    }
  })

  it('radial: depth increases with distance from origin (C1 fix)', () => {
    const { doc, childIds } = buildRadialTestTree()
    const ops = computeLayoutOps(doc, 'radial')
    const posMap = new Map<string, Position>()
    for (const op of ops) {
      if ('nodeId' in op) posMap.set(op.nodeId, op.position)
    }
    const childR = Math.hypot(
      posMap.get(childIds[0]!)!.x,
      posMap.get(childIds[0]!)!.y,
    )
    const gcId = doc.nodes[childIds[0]!]!.childOrder[0]!
    const gcR = Math.hypot(posMap.get(gcId)!.x, posMap.get(gcId)!.y)
    expect(gcR).toBeGreaterThan(childR)
  })
})
