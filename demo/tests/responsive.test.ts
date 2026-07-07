import { describe, expect, it } from 'vitest'
import { getResponsiveOutlineWidth } from '../src/responsive'

describe('responsive demo layout helpers', () => {
  it('keeps desktop outline width unchanged', () => {
    expect(getResponsiveOutlineWidth(1440)).toBe(320)
  })

  it('shrinks outline on 375px mobile so canvas keeps usable width', () => {
    expect(getResponsiveOutlineWidth(375)).toBeLessThanOrEqual(160)
  })

  it('never returns an outline wider than 45 percent of narrow viewports', () => {
    expect(getResponsiveOutlineWidth(375)).toBeLessThanOrEqual(375 * 0.45)
    expect(getResponsiveOutlineWidth(430)).toBeLessThanOrEqual(430 * 0.45)
  })
})
