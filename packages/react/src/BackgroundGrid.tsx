// BackgroundGrid: dot or line grid background for the canvas.
//
// Rendered as SVG pattern inside the transformed viewport container,
// so the grid pans/zooms with the content for spatial context.

import { memo } from 'react'

interface BackgroundGridProps {
  type: 'dots' | 'lines' | 'none'
  width: number
  height: number
}

const DOT_SPACING = 24
const LINE_SPACING = 24

function BackgroundGridComponent({
  type,
  width,
  height,
}: BackgroundGridProps): React.ReactElement | null {
  if (type === 'none') return null

  if (type === 'dots') {
    return (
      <div
        className="mml-background-grid mml-background-grid--dots"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${width}px`,
          height: `${height}px`,
          backgroundImage: `radial-gradient(circle, var(--mml-grid-color, #ccc) 1px, transparent 1px)`,
          backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
          pointerEvents: 'none',
        }}
      />
    )
  }

  // lines
  return (
    <div
      className="mml-background-grid mml-background-grid--lines"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${width}px`,
        height: `${height}px`,
        backgroundImage: `
          linear-gradient(to right, var(--mml-grid-color, #ddd) 1px, transparent 1px),
          linear-gradient(to bottom, var(--mml-grid-color, #ddd) 1px, transparent 1px)
        `,
        backgroundSize: `${LINE_SPACING}px ${LINE_SPACING}px`,
        pointerEvents: 'none',
      }}
    />
  )
}

export const BackgroundGrid = memo(BackgroundGridComponent)
