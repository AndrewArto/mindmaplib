import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EdgeView } from '../src/EdgeView.js'
import type { EdgeViewProps } from '../src/types.js'

function defaultProps(overrides: Partial<EdgeViewProps> = {}): EdgeViewProps {
  return {
    parentId: 'parent',
    childId: 'child',
    parentPosition: { x: 0, y: 0 },
    childPosition: { x: 200, y: 100 },
    parentMeasure: { width: 120, height: 40 },
    childMeasure: { width: 120, height: 40 },
    layoutMode: 'tree-horizontal',
    isSelected: false,
    ...overrides,
  }
}

describe('EdgeView', () => {
  it('renders an SVG path', () => {
    const { container } = render(<EdgeView {...defaultProps()} />)
    const path = container.querySelector('path')
    expect(path).toBeTruthy()
    expect(path?.getAttribute('d')).toBeTruthy()
  })

  it('uses Bezier curve for tree-horizontal', () => {
    const { container } = render(
      <EdgeView {...defaultProps({ layoutMode: 'tree-horizontal' })} />,
    )
    const d = container.querySelector('path')?.getAttribute('d')
    expect(d).toContain('C')
  })

  it('uses Bezier curve for tree-vertical', () => {
    const { container } = render(
      <EdgeView {...defaultProps({ layoutMode: 'tree-vertical' })} />,
    )
    const d = container.querySelector('path')?.getAttribute('d')
    expect(d).toContain('C')
  })

  it('uses straight line for free-float', () => {
    const { container } = render(
      <EdgeView {...defaultProps({ layoutMode: 'free-float' })} />,
    )
    const d = container.querySelector('path')?.getAttribute('d')
    expect(d).toContain('L')
    expect(d).not.toContain('C')
  })

  it('uses straight line for radial', () => {
    const { container } = render(
      <EdgeView {...defaultProps({ layoutMode: 'radial' })} />,
    )
    const d = container.querySelector('path')?.getAttribute('d')
    expect(d).toContain('L')
  })

  it('applies selected class when isSelected', () => {
    const { container } = render(
      <EdgeView {...defaultProps({ isSelected: true })} />,
    )
    const path = container.querySelector('path')
    expect(path?.className).toContain('selected')
  })

  it('uses default measures when null', () => {
    const { container } = render(
      <EdgeView
        {...defaultProps({ parentMeasure: null, childMeasure: null })}
      />,
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('d')).toBeTruthy()
  })
})
