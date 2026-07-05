// Layout engine: computeLayoutOps returns layoutPosition TransactionOps for
// auto-positioned nodes (MML-B-0001 § Layout). Free-float returns no ops.
// Manual-positioned nodes act as fixed anchors for their subtrees.

import { hierarchy, tree } from 'd3-hierarchy'
import type { HierarchyPointNode } from 'd3-hierarchy'
import type {
  LayoutMode,
  LayoutOptions,
  MindmapDoc,
  MindmapNode,
  Position,
  TransactionOp,
} from './types.js'
import { createLayoutPositionOp } from './transactions.js'

const DEFAULT_NODE_SIZE = { width: 120, height: 40 }

/**
 * Compute layoutPosition ops for all auto-positioned nodes in `doc`.
 *
 * - free-float → returns [] (positions are user-owned).
 * - tree-horizontal / tree-vertical / radial → uses d3-hierarchy tidy tree.
 *
 * Nodes with manualPosition === true are preserved (no op emitted) and act as
 * fixed anchors: their auto-positioned descendants are offset relative to the
 * manual node's stored position. Collapsed nodes are treated as leaves.
 *
 * Note: d3's tidy tree uses a single node size for spacing. Per-node measures
 * (nodeMeasures) are accepted for API completeness; defaultNodeSize + spacing
 * drive the layout in this implementation.
 */
export function computeLayoutOps(
  doc: MindmapDoc,
  mode: LayoutMode,
  options?: LayoutOptions,
): TransactionOp[] {
  if (mode === 'free-float') return []

  const defaultNodeSize = options?.defaultNodeSize ?? DEFAULT_NODE_SIZE
  const spacingX = options?.spacingX ?? 40
  const spacingY = options?.spacingY ?? 20

  const rootData = doc.nodes[doc.rootId]
  if (!rootData) return []

  // Build a transient d3 hierarchy. Collapsed nodes are leaves.
  const h = hierarchy<MindmapNode>(rootData, (node) => {
    if (node.collapsed) return null
    const kids = node.childOrder
      .map((id) => doc.nodes[id])
      .filter((n): n is MindmapNode => n !== undefined)
    return kids.length > 0 ? kids : null
  })

  // d3 tree nodeSize is [siblingSpacing, depthSpacing].
  // For tree-horizontal the depth axis is horizontal, so it must use
  // width + spacingX (otherwise 120px-wide nodes overlap at 60px intervals).
  const siblingW =
    mode === 'tree-horizontal'
      ? defaultNodeSize.height + spacingY
      : defaultNodeSize.width + spacingX
  const depthW =
    mode === 'tree-horizontal'
      ? defaultNodeSize.width + spacingX
      : defaultNodeSize.height + spacingY

  // Lay out. For radial, size() maps the full tree into the given box,
  // so total radius = (maxDepth + 1) * depthW gives correct per-level spacing.
  // For tree modes, nodeSize() gives per-level spacing directly.
  const maxDepth = h.height ?? 0
  const laid: HierarchyPointNode<MindmapNode> =
    mode === 'radial'
      ? tree<MindmapNode>().size([2 * Math.PI, (maxDepth + 1) * depthW])(h)
      : tree<MindmapNode>().nodeSize([siblingW, depthW])(h)

  const toPos = (d: HierarchyPointNode<MindmapNode>): Position => {
    const x = d.x ?? 0
    const y = d.y ?? 0
    if (mode === 'tree-horizontal') {
      // depth → x (horizontal), breadth → y
      return { x: y, y: x }
    }
    if (mode === 'tree-vertical') {
      return { x, y }
    }
    // radial: d.x is angle, d.y is radius
    return { x: y * Math.cos(x), y: y * Math.sin(x) }
  }

  const ops: TransactionOp[] = []

  // Pre-order DFS propagating an offset from the nearest manual ancestor.
  const walk = (d: HierarchyPointNode<MindmapNode>, offset: Position): void => {
    const node = d.data
    const d3Pos = toPos(d)
    if (node.manualPosition && node.position) {
      // Manual anchor: shift this subtree so the anchor sits at its stored
      // position. No op for the anchor itself. Offset is RESET (not
      // accumulated) to avoid double-counting ancestor shifts.
      const newOffset: Position = {
        x: node.position.x - d3Pos.x,
        y: node.position.y - d3Pos.y,
      }
      if (d.children) for (const c of d.children) walk(c, newOffset)
    } else {
      const finalPos: Position = {
        x: d3Pos.x + offset.x,
        y: d3Pos.y + offset.y,
      }
      ops.push(createLayoutPositionOp(node.id, finalPos))
      if (d.children) for (const c of d.children) walk(c, offset)
    }
  }

  walk(laid, { x: 0, y: 0 })
  return ops
}
