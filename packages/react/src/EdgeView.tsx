// EdgeView: SVG edge path between parent and child nodes.
//
// Computes Bezier curves for tree layouts and straight lines for radial/free-float.
// Uses document coordinates (not screen coordinates).

import { memo } from 'react'
import type { EdgeViewProps } from './types.js'

const DEFAULT_W = 120
const DEFAULT_H = 40

function computePath(
  parentPos: { x: number; y: number },
  childPos: { x: number; y: number },
  parentMeasure: { width: number; height: number } | null,
  childMeasure: { width: number; height: number } | null,
  layoutMode: EdgeViewProps['layoutMode'],
): string {
  const pw = parentMeasure?.width ?? DEFAULT_W
  const ph = parentMeasure?.height ?? DEFAULT_H
  const cw = childMeasure?.width ?? DEFAULT_W
  const ch = childMeasure?.height ?? DEFAULT_H

  if (layoutMode === 'tree-vertical') {
    // Parent bottom-center to child top-center
    const x1 = parentPos.x + pw / 2
    const y1 = parentPos.y + ph
    const x2 = childPos.x + cw / 2
    const y2 = childPos.y
    const midY = (y1 + y2) / 2
    return `M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`
  }

  if (layoutMode === 'radial' || layoutMode === 'free-float') {
    // Straight line from parent center to child center
    const x1 = parentPos.x + pw / 2
    const y1 = parentPos.y + ph / 2
    const x2 = childPos.x + cw / 2
    const y2 = childPos.y + ch / 2
    return `M ${x1},${y1} L ${x2},${y2}`
  }

  // tree-horizontal and default: parent right-center to child left-center, Bezier
  const x1 = parentPos.x + pw
  const y1 = parentPos.y + ph / 2
  const x2 = childPos.x
  const y2 = childPos.y + ch / 2
  const midX = (x1 + x2) / 2
  return `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`
}

function EdgeViewComponent({
  parentPosition,
  childPosition,
  parentMeasure,
  childMeasure,
  layoutMode,
  isSelected,
}: EdgeViewProps): React.ReactElement {
  const d = computePath(
    parentPosition,
    childPosition,
    parentMeasure,
    childMeasure,
    layoutMode,
  )

  return (
    <path
      d={d}
      className={isSelected ? 'mml-edge mml-edge--selected' : 'mml-edge'}
      fill="none"
    />
  )
}

export const EdgeView = memo(EdgeViewComponent)
