import { describe, it, expect } from 'vitest'
import {
  createAddNodeOp,
  createDeleteNodeOp,
  createMoveNodeOp,
  createUpdateContentOp,
  createSetPositionOp,
  createLayoutPositionOp,
  createResetManualPositionOp,
  createToggleCollapsedOp,
  buildTransaction,
  applyOp,
  applyTransaction,
} from '../src/transactions.js'
import { createDoc, getNode } from '../src/document.js'
import { VersionConflictError } from '../src/errors.js'
import { emptyContent } from '../src/content.js'

describe('op factories', () => {
  it('createAddNodeOp builds the correct shape', () => {
    const op = createAddNodeOp('p', 'n1', { insertAfter: 'x' })
    expect(op).toEqual({
      type: 'addNode',
      parentId: 'p',
      nodeId: 'n1',
      insertAfter: 'x',
    })
  })

  it('createAddNodeOp omits insertAfter when not provided', () => {
    const op = createAddNodeOp('p', 'n1')
    expect('insertAfter' in op).toBe(false)
  })

  it('createMoveNodeOp includes insertAfter only when provided', () => {
    expect(createMoveNodeOp('n', 'p')).toEqual({
      type: 'moveNode',
      nodeId: 'n',
      newParentId: 'p',
    })
    expect(createMoveNodeOp('n', 'p', null)).toMatchObject({
      insertAfter: null,
    })
  })

  it('remaining factories produce single-field ops', () => {
    expect(createDeleteNodeOp('n')).toEqual({ type: 'deleteNode', nodeId: 'n' })
    expect(createUpdateContentOp('n', emptyContent())).toMatchObject({
      type: 'updateContent',
      nodeId: 'n',
    })
    expect(createSetPositionOp('n', { x: 1, y: 2 })).toMatchObject({
      type: 'setPosition',
    })
    expect(createLayoutPositionOp('n', { x: 1, y: 2 })).toMatchObject({
      type: 'layoutPosition',
    })
    expect(createResetManualPositionOp('n')).toEqual({
      type: 'resetManualPosition',
      nodeId: 'n',
    })
    expect(createToggleCollapsedOp('n')).toEqual({
      type: 'toggleCollapsed',
      nodeId: 'n',
    })
  })
})

describe('buildTransaction', () => {
  it('captures baseVersion from the doc and generates id/timestamp', () => {
    const doc = createDoc('D')
    const tx = buildTransaction(doc, createDeleteNodeOp('x'))
    expect(tx.baseVersion).toBe(doc.version)
    expect(tx.id).toBeTruthy()
    expect(tx.timestamp).toMatch(/^\d{4}-/)
    expect(tx.ops).toHaveLength(1)
    expect(tx.actorId).toBeUndefined()
  })

  it('flattens multiple ops into one transaction', () => {
    const doc = createDoc('D')
    const tx = buildTransaction(doc, [
      createAddNodeOp(doc.rootId, 'a'),
      createAddNodeOp(doc.rootId, 'b'),
    ])
    expect(tx.ops).toHaveLength(2)
  })

  it('passes actorId through', () => {
    const doc = createDoc('D')
    const tx = buildTransaction(doc, createDeleteNodeOp('x'), {
      actorId: 'user-1',
    })
    expect(tx.actorId).toBe('user-1')
  })
})

describe('applyOp', () => {
  it('applies an addNode op with an explicit id', () => {
    const doc = createDoc('D')
    const next = applyOp(doc, createAddNodeOp(doc.rootId, 'n1'))
    expect(getNode(next, 'n1')).toBeDefined()
    expect(getNode(next, 'n1')!.parentId).toBe(doc.rootId)
  })

  it('does not increment version (that is applyTransaction’s job)', () => {
    const doc = createDoc('D')
    const next = applyOp(doc, createAddNodeOp(doc.rootId, 'n1'))
    expect(next.version).toBe(doc.version) // unchanged
  })

  it('applies setPosition then resetManualPosition op sequence', () => {
    const doc = createDoc('D')
    let next = applyOp(doc, createAddNodeOp(doc.rootId, 'n1'))
    next = applyOp(next, createSetPositionOp('n1', { x: 5, y: 6 }))
    expect(getNode(next, 'n1')!.manualPosition).toBe(true)
    next = applyOp(next, createResetManualPositionOp('n1'))
    expect(getNode(next, 'n1')!.manualPosition).toBe(false)
    expect(getNode(next, 'n1')!.position).toBeNull()
  })

  it('layoutPosition keeps manualPosition=false', () => {
    const doc = createDoc('D')
    let next = applyOp(doc, createAddNodeOp(doc.rootId, 'n1'))
    next = applyOp(next, createLayoutPositionOp('n1', { x: 10, y: 20 }))
    expect(getNode(next, 'n1')!.position).toEqual({ x: 10, y: 20 })
    expect(getNode(next, 'n1')!.manualPosition).toBe(false)
  })
})

describe('applyTransaction', () => {
  it('increments version by exactly 1 regardless of op count', () => {
    const doc = createDoc('D')
    const tx = buildTransaction(doc, [
      createAddNodeOp(doc.rootId, 'a'),
      createAddNodeOp(doc.rootId, 'b'),
      createAddNodeOp(doc.rootId, 'c'),
    ])
    const next = applyTransaction(doc, tx)
    expect(next.version).toBe(doc.version + 1)
    expect(Object.keys(next.nodes)).toHaveLength(4) // root + 3
  })

  it('refreshes meta (new reference) with a valid ISO updated', () => {
    const doc = createDoc('D')
    const next = applyTransaction(
      doc,
      buildTransaction(doc, createAddNodeOp(doc.rootId, 'a')),
    )
    // immutability: meta is a new object reference
    expect(next.meta).not.toBe(doc.meta)
    // updated stays a valid ISO 8601 timestamp
    expect(next.meta.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('throws VersionConflictError in strict mode on baseVersion mismatch', () => {
    const doc = createDoc('D')
    // build a tx against an outdated baseVersion
    const tx = { ...buildTransaction(doc, createAddNodeOp(doc.rootId, 'a')) }
    const advanced = applyTransaction(doc, tx) // version now 1
    // tx.baseVersion is 0, advanced.version is 1
    expect(() => applyTransaction(advanced, tx, { strict: true })).toThrow(
      VersionConflictError,
    )
  })

  it('applies regardless of baseVersion when not strict (default)', () => {
    const doc = createDoc('D')
    const tx = buildTransaction(doc, createAddNodeOp(doc.rootId, 'a'))
    const advanced = applyTransaction(doc, tx)
    // stale tx applied non-strictly
    expect(() => applyTransaction(advanced, tx)).not.toThrow()
  })
})
