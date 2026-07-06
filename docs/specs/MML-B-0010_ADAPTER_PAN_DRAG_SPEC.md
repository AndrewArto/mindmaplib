# Spec: Canvas Pan & Node Drag — Real Browser Fix (MML-B-0010)

Status: draft
Created: 2026-07-06
Owner: Andrey
Spec-ID: MML-B-0010
Spec-Version: 1.0.0+backlog.0010
Backlog lane: urgent
Depends-on: MML-B-0009 (core setPositionDirect/commitPosition API)
Supersedes: MML-B-0009 adapter fixes (PR #10 — incomplete)
Process: SDLC.md, AGENTS.md, DEVELOPMENT_PROCESS.md

## Problem

Canvas pan and node drag do not work in real browsers. They work in
synthetic jsdom test environments (fireEvent) but fail when a human
interacts with the deployed demo or dev server.

### Root Cause

`handleMouseDown` in `CanvasView.tsx` does not call `e.preventDefault()`.

Without `preventDefault()`, when a user clicks on the canvas background
(`user-select: auto`) and starts dragging:

1. The browser initiates a **native text selection drag** operation.
2. Once native selection starts, `mousemove` events may be suppressed or
   rerouted by the browser's selection mechanism.
3. Document-level `mousemove` listeners added by `handleMouseDown` never
   fire (or fire with degraded frequency).
4. The SVG background grid renders an `<image>` element, which is
   `draggable=true` by default. Mousedown on the image starts a native
   drag-and-drop operation, which completely suppresses `mousemove`.

In jsdom there is no text selection, no native drag-and-drop, and
`fireEvent` dispatches synthetic events that bypass browser selection
logic — so tests pass but real browsers fail.

### Secondary Issues

- `handleMouseDown` has `doc` in its deps array: `[doc, handleDragMove,
handleDragEnd]`. `doc` changes on every editor state update (selection,
  position, content). This recreates the callback on every render, but it
  is a React synthetic event handler so this is harmless (just wasteful).
- `NodeView.onMouseDown` calls `editor.select()` without
  `e.stopPropagation()`, causing both node-select and canvas-drag to fire
  on node mousedown. For background pan this is not the issue, but for
  node drag it creates a race between select re-render and drag start.

## Goals

1. Canvas pan works in real browsers (Chrome, Safari, Firefox).
2. Node drag works in real browsers, produces one undo entry.
3. No native text selection or native drag-and-drop interference.
4. Tests verify the fix, not just synthetic event plumbing.

## Non-Goals

- Touch/pointer event support (separate spec).
- Outline view drag-and-drop (separate concern).
- Radial layout math (fixed in MML-B-0009 core).

## Fix

### F1: Prevent default browser behavior on mousedown

In `handleMouseDown`, call `e.preventDefault()` for both pan and node-drag
paths. This prevents text selection and native drag-and-drop initiation.

### F2: CSS user-select: none on canvas

Add `user-select: none` (and `-webkit-user-drag: none` for Safari) to the
`.mml-canvas` selector in the React adapter's stylesheet.

### F3: Disable native drag on background grid image

The `BackgroundGrid` component renders an SVG with an embedded image.
Add `draggable={false}` or set CSS `-webkit-user-drag: none` / `pointer-events:
none` on any image-like elements that could trigger native drag.

### F4: Stable handler architecture

Refactor `handleMouseDown` to remove `doc` from its deps. Read `doc` from
a ref (`docRef`) like `viewportRef`. This makes ALL handlers stable
(empty deps or `[editor]` only), which is the correct pattern for
document-level listener add/remove.

### F5: NodeView mousedown stopPropagation

In `NodeView.tsx`, add `e.stopPropagation()` in the `onMouseDown` handler
(after `editor.select()`). This prevents the canvas `handleMouseDown`
from also firing when a node is clicked, avoiding the select-re-render
race during drag start.

## Tests

Unit tests (vitest + @testing-library):

1. **Pan mousedown calls preventDefault**: verify that the mousedown event
   has `defaultPrevented === true` after the handler runs.
2. **Node drag mousedown calls preventDefault**: same for node click.
3. **Pan works with userEvent (not fireEvent)**: use `@testing-library/
user-event` which dispatches events more like a real browser.
4. **Drag produces one undo entry**: existing test, keep.
5. **Undo after drag returns to pre-drag**: existing test, keep.

Manual verification (E2E checklist):

1. Open demo in Chrome dev server.
2. Click on background between nodes, drag → canvas pans.
3. Release → pan stops, no lingering listeners.
4. Click on a node, drag → node moves, other nodes stay.
5. Release → one undo entry created.
6. Ctrl+Z → node returns to pre-drag position in one step.
7. No text selection appears during pan or drag.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check-boundaries
pnpm run ci
```

Changeset: `@mindmaplib/react` patch (or minor per Andrey's request).

## Affected Files

- `packages/react/src/CanvasView.tsx` — preventDefault, ref-based handlers
- `packages/react/src/NodeView.tsx` — stopPropagation on mousedown
- `packages/react/src/styles.css` (or equivalent) — user-select: none
- `packages/react/src/BackgroundGrid.tsx` — draggable=false
- `packages/react/tests/CanvasView.test.tsx` — preventDefault assertion
