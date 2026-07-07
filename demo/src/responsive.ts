const DESKTOP_OUTLINE_WIDTH = 320
const MOBILE_OUTLINE_RATIO = 0.42
const MOBILE_OUTLINE_MIN = 128
const MOBILE_BREAKPOINT = 700

export function getResponsiveOutlineWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return DESKTOP_OUTLINE_WIDTH
  }

  if (viewportWidth >= MOBILE_BREAKPOINT) {
    return DESKTOP_OUTLINE_WIDTH
  }

  return Math.max(
    MOBILE_OUTLINE_MIN,
    Math.floor(viewportWidth * MOBILE_OUTLINE_RATIO),
  )
}
