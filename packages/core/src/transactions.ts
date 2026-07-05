// Transaction operations: factories, applyOp, buildTransaction, applyTransaction.
//
// applyOp is the pure structural transform for a single op (no version bump).
// applyTransaction applies a sequence of ops and increments doc.version by 1
// (per transaction, not per op), per MML-B-0001 § Transactions.

import type {
  LayoutMode,
  LayoutOptions,
  MindmapDoc,
  MindmapNode,
  NodeContent,
  Position,
  Transaction,
  TransactionOp,
} from './types.js'
import { MindmapError, VersionConflictError } from './errors.js'
import { createId } from './id.js'
import { emptyContent, normalizeContent } from './content.js'

// ---------------------------------------------------------------------------
// Operation factories
// ---------------------------------------------------------------------------

export function createAddNodeOp(
  parentId: string,
  nodeId: string,
  opts?: { insertAfter?: string | null; content?: NodeContent },
): TransactionOp {
  return {
    type: 'addNode',
    parentId,
    nodeId,
    ...(opts?.insertAfter !== undefined
      ? { insertAfter: opts.insertAfter }
      : {}),
    ...(opts?.content ? { content: opts.content } : {}),
  }
}

export function createDeleteNodeOp(nodeId: string): TransactionOp {
  return { type: 'deleteNode', nodeId }
}

export function createMoveNodeOp(
  nodeId: string,
  newParentId: string,
  insertAfter?: string | null,
): TransactionOp {
  const op: TransactionOp = { type: 'moveNode', nodeId, newParentId }
  if (insertAfter !== undefined) {
    ;(op as Extract<TransactionOp, { type: 'moveNode' }>).insertAfter =
      insertAfter
  }
  return op
}

export function createUpdateContentOp(
  nodeId: string,
  content: NodeContent,
): TransactionOp {
  return { type: 'updateContent', nodeId, content }
}

export function createSetPositionOp(
  nodeId: string,
  position: Position,
): TransactionOp {
  return { type: 'setPosition', nodeId, position }
}

export function createLayoutPositionOp(
  nodeId: string,
  position: Position,
): TransactionOp {
  return { type: 'layoutPosition', nodeId, position }
}

export function createResetManualPositionOp(nodeId: string): TransactionOp {
  return { type: 'resetManualPosition', nodeId }
}

export function createToggleCollapsedOp(nodeId: string): TransactionOp {
  return { type: 'toggleCollapsed', nodeId }
}

// ---------------------------------------------------------------------------
// Transaction builder
// ---------------------------------------------------------------------------

export function buildTransaction(
  doc: MindmapDoc,
  ops: TransactionOp | TransactionOp[],
  opts?: { actorId?: string },
): Transaction {
  const flat = Array.isArray(ops) ? ops : [ops]
  return {
    id: createId('tx'),
    baseVersion: doc.version,
    ops: flat,
    timestamp: new Date().toISOString(),
    ...(opts?.actorId ? { actorId: opts.actorId } : {}),
  }
}

// ---------------------------------------------------------------------------
// Internal helpers (structural, no version bump)
// ---------------------------------------------------------------------------

function cloneDoc(doc: MindmapDoc): MindmapDoc {
  return { ...doc, nodes: { ...doc.nodes } }
}

function replaceNode(
  doc: MindmapDoc,
  nodeId: string,
  patch: Partial<MindmapNode>,
): void {
  const existing = doc.nodes[nodeId]
  if (!existing) return
  doc.nodes[nodeId] = { ...existing, ...patch }
}

/**
 * Insert `childId` into `childOrder` at the position dictated by
 * `insertAfter`: null → beginning, a present id → right after it,
 * missing/absent id → end.
 */
function insertIntoChildOrder(
  childOrder: string[],
  childId: string,
  insertAfter: string | null | undefined,
): string[] {
  const next = childOrder.filter((id) => id !== childId)
  if (insertAfter === undefined) {
    // default: append at end
    return [...next, childId]
  }
  if (insertAfter === null) {
    // beginning
    return [childId, ...next]
  }
  // string: insert right after it, or end if not found
  const idx = next.indexOf(insertAfter)
  if (idx === -1) {
    return [...next, childId]
  }
  return [...next.slice(0, idx + 1), childId, ...next.slice(idx + 1)]
}

/** Collect all descendant ids of `nodeId` (not including the node itself). */
function collectDescendantIds(doc: MindmapDoc, nodeId: string): string[] {
  const result: string[] = []
  const stack = [...(doc.nodes[nodeId]?.childOrder ?? [])]
  while (stack.length) {
    const id = stack.pop()!
    result.push(id)
    const node = doc.nodes[id]
    if (node) stack.push(...node.childOrder)
  }
  return result
}

/** True if `ancestorId` is an ancestor of (or equal to) `descendantId`. */
function isAncestorOrSelf(
  doc: MindmapDoc,
  ancestorId: string,
  descendantId: string,
): boolean {
  let cursor: string | null = descendantId
  while (cursor !== null) {
    if (cursor === ancestorId) return true
    const node: MindmapNode | undefined = doc.nodes[cursor]
    if (!node) return false
    cursor = node.parentId
  }
  return false
}

function assertFinite(pos: Position): void {
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
    throw new MindmapError(
      `Invalid position: coordinates must be finite numbers (got x=${pos.x}, y=${pos.y})`,
      'INVALID_POSITION',
    )
  }
}

// ---------------------------------------------------------------------------
// applyOp — pure structural transform for a single op (no version bump)
// ---------------------------------------------------------------------------

export function applyOp(doc: MindmapDoc, op: TransactionOp): MindmapDoc {
  const next = cloneDoc(doc)

  switch (op.type) {
    case 'addNode': {
      const parent = next.nodes[op.parentId]
      if (!parent) {
        throw new MindmapError(
          `addNode: parent ${op.parentId} not found`,
          'NODE_NOT_FOUND',
          op.parentId,
        )
      }
      const content = op.content ? normalizeContent(op.content) : emptyContent()
      const node: MindmapNode = {
        id: op.nodeId,
        parentId: op.parentId,
        position: null,
        manualPosition: false,
        content,
        collapsed: false,
        childOrder: [],
      }
      next.nodes[op.nodeId] = node
      replaceNode(next, op.parentId, {
        childOrder: insertIntoChildOrder(
          parent.childOrder,
          op.nodeId,
          op.insertAfter,
        ),
      })
      break
    }

    case 'deleteNode': {
      const node = next.nodes[op.nodeId]
      if (!node) {
        throw new MindmapError(
          `deleteNode: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      if (op.nodeId === doc.rootId) {
        throw new MindmapError(
          'deleteNode: root node is immutable and cannot be deleted',
          'ROOT_IMMUTABLE',
          op.nodeId,
        )
      }
      const subtree = [op.nodeId, ...collectDescendantIds(next, op.nodeId)]
      for (const id of subtree) {
        delete next.nodes[id]
      }
      if (node.parentId) {
        const parent = next.nodes[node.parentId]
        if (parent) {
          replaceNode(next, node.parentId, {
            childOrder: parent.childOrder.filter((id) => id !== op.nodeId),
          })
        }
      }
      break
    }

    case 'moveNode': {
      const node = next.nodes[op.nodeId]
      if (!node) {
        throw new MindmapError(
          `moveNode: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      const newParent = next.nodes[op.newParentId]
      if (!newParent) {
        throw new MindmapError(
          `moveNode: new parent ${op.newParentId} not found`,
          'NODE_NOT_FOUND',
          op.newParentId,
        )
      }
      if (op.nodeId === doc.rootId) {
        throw new MindmapError(
          'moveNode: root node is immutable and cannot be reparented',
          'ROOT_IMMUTABLE',
          op.nodeId,
        )
      }
      if (isAncestorOrSelf(next, op.nodeId, op.newParentId)) {
        throw new MindmapError(
          `moveNode: cannot move ${op.nodeId} under its descendant ${op.newParentId}`,
          'CYCLE_DETECTED',
          op.nodeId,
        )
      }
      // remove from old parent childOrder
      if (node.parentId) {
        const oldParent = next.nodes[node.parentId]
        if (oldParent) {
          replaceNode(next, node.parentId, {
            childOrder: oldParent.childOrder.filter((id) => id !== op.nodeId),
          })
        }
      }
      // set new parentId + insert into new parent childOrder
      replaceNode(next, op.nodeId, { parentId: op.newParentId })
      replaceNode(next, op.newParentId, {
        childOrder: insertIntoChildOrder(
          newParent.childOrder,
          op.nodeId,
          op.insertAfter,
        ),
      })
      break
    }

    case 'updateContent': {
      if (!next.nodes[op.nodeId]) {
        throw new MindmapError(
          `updateContent: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      replaceNode(next, op.nodeId, {
        content: normalizeContent(op.content),
      })
      break
    }

    case 'setPosition': {
      assertFinite(op.position)
      if (!next.nodes[op.nodeId]) {
        throw new MindmapError(
          `setPosition: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      replaceNode(next, op.nodeId, {
        position: { ...op.position },
        manualPosition: true,
      })
      break
    }

    case 'layoutPosition': {
      assertFinite(op.position)
      if (!next.nodes[op.nodeId]) {
        throw new MindmapError(
          `layoutPosition: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      replaceNode(next, op.nodeId, {
        position: { ...op.position },
        manualPosition: false,
      })
      break
    }

    case 'resetManualPosition': {
      if (!next.nodes[op.nodeId]) {
        throw new MindmapError(
          `resetManualPosition: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      replaceNode(next, op.nodeId, {
        manualPosition: false,
        position: null,
      })
      break
    }

    case 'toggleCollapsed': {
      if (!next.nodes[op.nodeId]) {
        throw new MindmapError(
          `toggleCollapsed: node ${op.nodeId} not found`,
          'NODE_NOT_FOUND',
          op.nodeId,
        )
      }
      replaceNode(next, op.nodeId, {
        collapsed: !next.nodes[op.nodeId].collapsed,
      })
      break
    }

    default: {
      const exhaustiveness: never = op
      throw new MindmapError(
        `applyOp: unknown op type ${(exhaustiveness as TransactionOp).type}`,
        'INVALID_TRANSACTION',
      )
    }
  }

  return next
}

// ---------------------------------------------------------------------------
// applyTransaction — applies ops, validates baseVersion, bumps version
// ---------------------------------------------------------------------------

export function applyTransaction(
  doc: MindmapDoc,
  tx: Transaction,
  opts?: { strict?: boolean },
): MindmapDoc {
  if (opts?.strict && tx.baseVersion !== doc.version) {
    throw new VersionConflictError(doc.version, tx.baseVersion, tx.id)
  }
  let next = doc
  for (const op of tx.ops) {
    next = applyOp(next, op)
  }
  next = {
    ...next,
    version: next.version + 1,
    meta: { ...next.meta, updated: new Date().toISOString() },
  }
  return next
}

// Re-export layout types for the computeLayoutOps signature (implemented in
// layout.ts). Kept here only to satisfy the public re-export wiring.
export type { LayoutMode, LayoutOptions }
