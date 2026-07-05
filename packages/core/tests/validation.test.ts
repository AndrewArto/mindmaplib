import { describe, it, expect } from 'vitest'
import { validateDoc } from '../src/validation.js'
import { createDoc, addNode } from '../src/document.js'
import { MindmapError } from '../src/errors.js'
import { emptyContent } from '../src/content.js'
import type { MindmapDoc, MindmapNode } from '../src/types.js'

function clone(doc: MindmapDoc): MindmapDoc {
  return { ...doc, nodes: { ...doc.nodes }, meta: { ...doc.meta } }
}

describe('validateDoc', () => {
  it('accepts a freshly created doc', () => {
    expect(() => validateDoc(createDoc('OK'))).not.toThrow()
  })

  it('accepts a doc after adding nodes', () => {
    const doc = createDoc('OK')
    const next = addNode(doc, doc.rootId)
    expect(() => validateDoc(next)).not.toThrow()
  })

  it('rejects an orphan node (not reachable from root)', () => {
    const doc = clone(createDoc('O'))
    const orphan: MindmapNode = {
      id: 'orphan',
      parentId: doc.rootId,
      position: null,
      manualPosition: false,
      content: emptyContent(),
      collapsed: false,
      childOrder: [],
    }
    doc.nodes.orphan = orphan
    expect(() => validateDoc(doc)).toThrow(MindmapError)
  })

  it('rejects childOrder/parent mismatch', () => {
    const doc = clone(createDoc('C'))
    // claim a child in childOrder without the child's parentId pointing back
    const root = doc.nodes[doc.rootId]!
    doc.nodes[doc.rootId] = { ...root, childOrder: ['ghost'] }
    expect(() => validateDoc(doc)).toThrow(MindmapError)
  })

  it('rejects a cycle', () => {
    const doc = clone(createDoc('Cy'))
    const root = doc.nodes[doc.rootId]!
    const n1: MindmapNode = {
      id: 'n1',
      parentId: doc.rootId,
      position: null,
      manualPosition: false,
      content: emptyContent(),
      collapsed: false,
      childOrder: [],
    }
    doc.nodes.n1 = n1
    // root childOrder includes n1, but n1 points back creating a loop via root
    doc.nodes[doc.rootId] = { ...root, childOrder: ['n1'] }
    // create a cycle: n1.parentId -> n1 (self loop)
    doc.nodes.n1 = { ...n1, parentId: 'n1' }
    expect(() => validateDoc(doc)).toThrow(MindmapError)
  })

  it('rejects manualPosition with null position', () => {
    const doc = clone(createDoc('M'))
    const root = doc.nodes[doc.rootId]!
    doc.nodes[doc.rootId] = { ...root, manualPosition: true, position: null }
    expect(() => validateDoc(doc)).toThrow(MindmapError)
  })

  it('rejects non-finite position', () => {
    const doc = clone(createDoc('NF'))
    const root = doc.nodes[doc.rootId]!
    doc.nodes[doc.rootId] = {
      ...root,
      manualPosition: true,
      position: { x: NaN, y: 1 },
    }
    expect(() => validateDoc(doc)).toThrow(MindmapError)
  })
})
