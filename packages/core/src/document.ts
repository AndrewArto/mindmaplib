// Document model: creation, read-only queries, and pure tree operations.
//
// The convenience operations (addNode, deleteNode, …) are thin wrappers over
// applyOp that bump doc.version by 1 per call and refresh meta.updated, matching
// the observable contract of wrapping each call in a single-op transaction
// (MML-B-0001 § Transactions, "Pure tree operations").

import type { MindmapDoc, MindmapNode, NodeContent, Position } from './types.js'
import { createId } from './id.js'
import { emptyContent } from './content.js'
import {
  applyOp,
  createAddNodeOp,
  createDeleteNodeOp,
  createMoveNodeOp,
  createResetManualPositionOp,
  createSetPositionOp,
  createToggleCollapsedOp,
  createUpdateContentOp,
} from './transactions.js'

// ---------------------------------------------------------------------------
// createDoc
// ---------------------------------------------------------------------------

export function createDoc(title: string): MindmapDoc {
  const rootId = createId('root')
  const docId = createId('doc')
  const now = new Date().toISOString()
  const root: MindmapNode = {
    id: rootId,
    parentId: null,
    position: null,
    manualPosition: false,
    content: emptyContent(),
    collapsed: false,
    childOrder: [],
  }
  return {
    id: docId,
    rootId,
    nodes: { [rootId]: root },
    version: 0,
    meta: { title, created: now, updated: now },
  }
}

// ---------------------------------------------------------------------------
// Queries (pure, read-only)
// ---------------------------------------------------------------------------

export function getNode(
  doc: MindmapDoc,
  nodeId: string,
): MindmapNode | undefined {
  return doc.nodes[nodeId]
}

/** Children of `nodeId`, ordered per its `childOrder`. */
export function getChildren(doc: MindmapDoc, nodeId: string): MindmapNode[] {
  const node = doc.nodes[nodeId]
  if (!node) return []
  return node.childOrder
    .map((id) => doc.nodes[id])
    .filter((n): n is MindmapNode => n !== undefined)
}

/** All descendants of `nodeId`, depth-first following childOrder. */
export function getDescendants(doc: MindmapDoc, nodeId: string): MindmapNode[] {
  const node = doc.nodes[nodeId]
  if (!node) return []
  const result: MindmapNode[] = []
  const visit = (id: string): void => {
    const n = doc.nodes[id]
    if (!n) return
    for (const childId of n.childOrder) {
      const child = doc.nodes[childId]
      if (child) {
        result.push(child)
        visit(childId)
      }
    }
  }
  visit(nodeId)
  return result
}

/** Path from root to `nodeId` inclusive. */
export function getPath(doc: MindmapDoc, nodeId: string): MindmapNode[] {
  const result: MindmapNode[] = []
  let cursor: string | null = nodeId
  const chain: MindmapNode[] = []
  while (cursor !== null) {
    const node: MindmapNode | undefined = doc.nodes[cursor]
    if (!node) break
    chain.push(node)
    cursor = node.parentId
  }
  // chain is node → root; reverse to get root → node
  for (let i = chain.length - 1; i >= 0; i--) {
    result.push(chain[i]!)
  }
  return result
}

/** Ancestors of `nodeId` from nearest parent up to root (excluding the node). */
export function getAncestors(doc: MindmapDoc, nodeId: string): MindmapNode[] {
  const result: MindmapNode[] = []
  const node = doc.nodes[nodeId]
  if (!node) return result
  let cursor = node.parentId
  while (cursor !== null) {
    const ancestor = doc.nodes[cursor]
    if (!ancestor) break
    result.push(ancestor)
    cursor = ancestor.parentId
  }
  return result
}

// ---------------------------------------------------------------------------
// Internal: apply one op + bump version + refresh meta.updated
// ---------------------------------------------------------------------------

function applyOne(
  doc: MindmapDoc,
  op: Parameters<typeof applyOp>[1],
): MindmapDoc {
  const next = applyOp(doc, op)
  return {
    ...next,
    version: next.version + 1,
    meta: { ...next.meta, updated: new Date().toISOString() },
  }
}

// ---------------------------------------------------------------------------
// Pure tree operations (convenience wrappers)
// ---------------------------------------------------------------------------

export function addNode(
  doc: MindmapDoc,
  parentId: string,
  opts?: { insertAfter?: string | null; content?: NodeContent },
): MindmapDoc {
  return applyOne(doc, createAddNodeOp(parentId, createId('node'), opts))
}

export function deleteNode(doc: MindmapDoc, nodeId: string): MindmapDoc {
  return applyOne(doc, createDeleteNodeOp(nodeId))
}

export function moveNode(
  doc: MindmapDoc,
  nodeId: string,
  newParentId: string,
  insertAfter?: string | null,
): MindmapDoc {
  return applyOne(doc, createMoveNodeOp(nodeId, newParentId, insertAfter))
}

export function updateNodeContent(
  doc: MindmapDoc,
  nodeId: string,
  content: NodeContent,
): MindmapDoc {
  return applyOne(doc, createUpdateContentOp(nodeId, content))
}

export function setNodePosition(
  doc: MindmapDoc,
  nodeId: string,
  position: Position,
): MindmapDoc {
  return applyOne(doc, createSetPositionOp(nodeId, position))
}

export function resetManualPosition(
  doc: MindmapDoc,
  nodeId: string,
): MindmapDoc {
  return applyOne(doc, createResetManualPositionOp(nodeId))
}

export function toggleNodeCollapsed(
  doc: MindmapDoc,
  nodeId: string,
): MindmapDoc {
  return applyOne(doc, createToggleCollapsedOp(nodeId))
}
