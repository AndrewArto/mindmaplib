# Spec: Core Layout and Position Fixes (MML-B-0009)

Status: draft
Created: 2026-07-06
Owner: Andrey
Spec-ID: MML-B-0009
Spec-Version: 1.0.0+backlog.0009
Backlog lane: urgent
Depends-on: MML-B-0001
Supersedes: none
Process: none

## Problem

Three bugs in @mindmaplib/core block the demo from being usable:

### C1: Radial layout collapses all nodes into a pile

`computeLayoutOps()` in `packages/core/src/layout.ts` uses
`tree().size([2 * Math.PI, radialRadius])` for radial mode.

`size()` distributes the ENTIRE tree into a fixed box. For radial:

- Root at radius 0 (center)
- Depth-1 nodes at radius `radialRadius / maxDepth` (NOT `radialRadius`)
- With 4 depth-1 nodes at radius ~30 and node width 160px+, they overlap completely

The math is wrong. Angular spacing at the innermost ring must account for
node width: minimum arc length between siblings = nodeWidth + spacing.

### C2: setPosition floods undo stack during drag

`editor.setPosition()` calls `this.apply()` which pushes a full undo entry.
During drag (60 mousemove events/second), this creates 60 undo entries/second,
destroying the undo history and incrementing document version 60x/second.

Drag should be ONE undo entry (the final position), not hundreds.

### C3: fitToScreen hardcodes 800x600

`editor.fitToScreen()` uses `const canvasW = 800; const canvasH = 600`.
The actual canvas container is different. Fit-to-screen always zooms wrong.

## Goals

1. Radial layout spreads nodes so they don't overlap
2. setPosition during drag creates at most ONE undo entry
3. fitToScreen accepts container dimensions (or delegates to adapter)

## Non-Goals

- Adapter drag fixes (ghost preview, commit-on-mouseup) — separate PR
- Canvas pan target detection — adapter issue
- Demo toolbar icons — demo issue

## Fix C1: Radial Layout

### Root Cause

`tree().size([2π, radius])` maps the full tree into a fixed angular+radial
box. It does NOT give per-node spacing. With `maxDepth=2` and
`radialRadius=120`, depth-1 nodes land at radius 60 (midpoint), not 120.
4 nodes at radius 60 spread over 2π have ~94px arc between them, but nodes
are 160px+ wide.

### Required Behavior

- Root at center (0, 0)
- Each depth level at radius `level * (maxNodeHeight + spacingY)`
- Angular spacing sufficient that siblings at the INNERMOST ring (depth 1)
  don't overlap: min arc between adjacent leaves = `maxNodeWidth + spacingX`
- Minimum radius for depth-1 ring:
  `r_min = max(leaves_at_depth_1 * (maxNodeWidth + spacingX) / (2π), maxNodeWidth * 2)`

### Implementation Approach

Option A (preferred): Use `tree().nodeSize()` for ALL modes (not `size()`),
then convert (x, y) to polar coordinates for radial:

```
// nodeSize gives per-leaf spacing in x, per-level spacing in y
const laid = tree<MindmapNode>().nodeSize([siblingW, depthW])(h)

// For radial: y is depth (radius), x is leaf position (angle)
// Scale x to angular range based on total leaf count
const totalLeaves = laid.leaves().length
const angleScale = (2 * Math.PI) / Math.max(totalLeaves, 1)

toPos(d) {
  const angle = d.x * angleScale  // or: center around 0
  const radius = d.y              // already in proper depth units
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}
```

Option B: Keep `size()` but compute a proper radius that gives enough
circumference at the innermost ring:

```
const leaves = h.leaves().length
const innerCircumference = leaves * (effectiveSize.width + spacingX)
const innerRadius = innerCircumference / (2 * Math.PI)
const radialRadius = Math.max(innerRadius * maxDepth, effectiveSize.width * 4)
```

Either approach is acceptable. Verify with the sample doc (4 depth-1
children, 12 depth-2 leaves) — no overlaps, nodes clearly separated.

### Test

Add test: `computeLayoutOps` with radial mode on a 3-level tree (1 root,
4 children, 12 grandchildren). Assert:

- No two nodes at the same depth have positions within `effectiveSize.width`
  of each other (arc distance check)
- Root is at (0, 0) or very close
- Depth increases with distance from origin

## Fix C2: setPosition Undo Behavior

### Root Cause

`editor.setPosition()` → `this.apply()` → `this.pushUndo(this.doc)`.
Every call is a full transaction with undo entry.

### Required Behavior

Add a method that updates position WITHOUT creating undo entries:

```typescript
/**
 * Update node position without creating an undo entry.
 * Used during drag: many updates, one undo entry on commit.
 * Does NOT increment document version.
 */
setPositionDirect(nodeId: string, position: Position): void

/**
 * Commit the current document state as a single undo entry.
 * Used after drag completes: captures the final position.
 * Increments document version.
 */
commitPosition(nodeId: string, position: Position): void
```

OR alternatively, add a batch/transaction API:

```typescript
editor.beginTransaction()
// multiple setPosition calls, no undo entries
editor.setPosition(id, pos1)
editor.setPosition(id, pos2)
editor.endTransaction() // creates ONE undo entry for all changes
```

Either approach is acceptable. The key requirement: drag produces ONE
undo entry for the entire drag operation, not one per mousemove.

### Test

- Call `setPositionDirect` 5 times → undo stack length unchanged
- Call `commitPosition` → undo stack +1
- `undo()` reverts to position before all 5 calls

## Fix C3: fitToScreen Container Dimensions

### Root Cause

Hardcoded 800x600 in `editor.fitToScreen()`.

### Required Behavior

```typescript
fitToScreen(containerWidth?: number, containerHeight?: number): void
```

- If dimensions provided, use them
- If omitted, fall back to 800x600 (backward compat) but log a deprecation warning
- The adapter will call `editor.fitToScreen(containerW, containerH)` from
  its own fitToScreen computation (it owns the container ref)

Alternative: remove `fitToScreen` from core entirely and make it
adapter-only (the spec MML-B-0007 already says the adapter computes
fit-to-screen). But removing a public API is a breaking change, so
prefer parameter addition.

### Test

- `fitToScreen(1200, 800)` on a 300x200 bounding box → zoom should be
  based on 1200x800, not 800x600

## Verification

All fixes must pass:

```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @mindmaplib/core test
pnpm check-boundaries
```

Add changeset: `@mindmaplib/core` patch (API additions, no breaking changes).
