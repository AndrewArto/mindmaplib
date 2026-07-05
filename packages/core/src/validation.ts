// Document invariant validation (MML-B-0001 § Document Invariants).
//
// validateDoc throws MindmapError(DOC_INVARIANT_VIOLATION) on the first
// violation. Used by deserialize (always) and in dev/test after operations.

import type { MindmapDoc, MindmapNode } from './types.js'
import { MindmapError } from './errors.js'

function fail(message: string, nodeId?: string): never {
  throw new MindmapError(message, 'DOC_INVARIANT_VIOLATION', nodeId)
}

/**
 * Validate all document invariants. Throws MindmapError
 * (DOC_INVARIANT_VIOLATION) on the first violation.
 */
export function validateDoc(doc: MindmapDoc): void {
  const ids = Object.keys(doc.nodes)

  // 1. rootId exists in nodes.
  const root = doc.nodes[doc.rootId]
  if (!root) fail(`rootId '${doc.rootId}' not found in nodes`)

  // 2. root.parentId is null.
  if (root!.parentId !== null) {
    fail('root node parentId must be null', doc.rootId)
  }

  // 3, 4, 5. every node reachable from root, no cycles, only root has null
  // parentId.
  for (const id of ids) {
    const node = doc.nodes[id]!
    if (id !== doc.rootId && node.parentId === null) {
      fail(`non-root node '${id}' has parentId null`, id)
    }
    // walk to root, detecting cycles
    const seen = new Set<string>()
    let cursor: string | null = id
    while (cursor !== null) {
      if (seen.has(cursor)) {
        fail(`cycle detected walking parentId from '${id}'`, id)
      }
      seen.add(cursor)
      const cur: MindmapNode | undefined = doc.nodes[cursor]
      if (!cur)
        fail(`dangling parentId '${cursor}' referenced from '${id}'`, id)
      cursor = cur!.parentId
    }
    if (!seen.has(doc.rootId)) {
      fail(`node '${id}' is not reachable from root`, id)
    }
  }

  // 6. childOrder consistency: exact children set, no duplicates, no foreigns.
  for (const id of ids) {
    const node = doc.nodes[id]!
    const actualChildren = ids.filter((cid) => doc.nodes[cid]!.parentId === id)
    if (node.childOrder.length !== actualChildren.length) {
      fail(
        `node '${id}' childOrder length ${node.childOrder.length} != actual children ${actualChildren.length}`,
        id,
      )
    }
    const orderSet = new Set<string>()
    for (const cid of node.childOrder) {
      if (orderSet.has(cid)) {
        fail(`duplicate '${cid}' in '${id}'.childOrder`, id)
      }
      orderSet.add(cid)
      const child = doc.nodes[cid]
      if (!child) fail(`childOrder entry '${cid}' not in nodes`, id)
      if (child!.parentId !== id) {
        fail(
          `childOrder entry '${cid}' has parentId '${child!.parentId}' != '${id}'`,
          id,
        )
      }
    }
  }

  // 7. no duplicate node ids — structurally guaranteed by Record keys.

  // 8. manualPosition === true → position non-null.
  for (const id of ids) {
    const node = doc.nodes[id]!
    if (node.manualPosition && node.position === null) {
      fail(`node '${id}' has manualPosition but null position`, id)
    }
  }

  // 9. position non-null → finite numbers.
  for (const id of ids) {
    const node = doc.nodes[id]!
    if (node.position !== null) {
      if (
        !Number.isFinite(node.position.x) ||
        !Number.isFinite(node.position.y)
      ) {
        fail(`node '${id}' has non-finite position`, id)
      }
    }
  }

  // 10. content matches NodeContent schema (shallow structural check; deep
  // normalization is normalizeContent's job).
  for (const id of ids) {
    const node = doc.nodes[id]!
    const c = node.content
    if (
      !c ||
      typeof c !== 'object' ||
      c.type !== 'doc' ||
      !Array.isArray(c.content)
    ) {
      fail(`node '${id}' has invalid content shape`, id)
    }
  }

  // 11. schemaVersion lives on SerializedDoc, not MindmapDoc — nothing to
  // check on the in-memory doc.
}
