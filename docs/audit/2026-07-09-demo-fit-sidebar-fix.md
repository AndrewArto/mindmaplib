# Change Evidence: demo fit-to-screen and sidebar action icons

Date: 2026-07-09
Agent: Stevens
Request/issue: ship follow-up fixes for production demo issues reported by Andrey: fit-to-screen leaves small maps tiny or cropped on the canvas, sidebar row actions use ambiguous letter labels (`R`, `D`) and overflow the left panel, and demo/outline controls expose premature interactivity. Also address Codex review P1 about selected-node auto-pan fighting user pan/zoom.

## Scope

- User-visible changes:
  - Fit to screen can scale small maps up when the caller provides real canvas dimensions.
  - No-dimension `fitToScreen()` fallback remains capped at zoom 1 to avoid clipping embedded canvases.
  - Demo toolbar and keyboard Cmd/Ctrl+0 pass the actual canvas size into `fitToScreen` where available.
  - Sidebar session actions use SVG icons: pencil for rename, copy for duplicate, and cross for delete.
  - Sidebar width and row flex behavior now keep the current saved-map names and action icons inside the left panel.
  - Fit-to-screen uses border-box node measurements, flushes initial browser measurements synchronously, and leaves 24px breathing room when real canvas dimensions are known.
  - Demo no longer exposes the premature node-editing toolbar buttons (`+C`, `+S`, `Del`) or outline search/collapse-all toolbar; outline interactivity will be handled separately.
  - Selected-node auto-pan no longer reacts to every viewport update, so user pan/zoom is not pulled back.
- Files changed:
  - `packages/core/src/editor.ts`
  - `packages/core/tests/editor.test.ts`
  - `packages/react/src/CanvasView.tsx`
  - `packages/react/src/hooks/useKeyboard.ts`
  - `packages/react/src/hooks/useNodeMeasures.ts`
  - `packages/react/tests/CanvasView.test.tsx`
  - `packages/react/tests/useKeyboard-additional.test.tsx`
  - `demo/src/App.tsx`
  - `demo/src/icons.tsx`
  - `demo/src/style.css`
  - `demo/tests/App.test.tsx`
  - `demo/tests/browser/demo-layout.spec.ts`
  - `playwright.config.ts`
  - `package.json`
- Public API: no breaking signature change. `MindmapEditor.fitToScreen(width?, height?)` remains the same method. Zoom expansion is enabled only when both dimensions are provided.

## Root Cause

1. Small-map fit bug:
   - `MindmapEditor.fitToScreen` computed `zoom = min(canvasW / width, canvasH / height, 1)`, so small maps were explicitly prevented from scaling above 1.
   - Demo toolbar called `editor.fitToScreen()` without passing the real canvas dimensions, relying on the fallback 800x600.

2. Codex P1 auto-pan bug:
   - `CanvasView` selected-node visibility effect depended on `viewport`.
   - Any user pan/zoom that moved the selected node outside the 40px margin reran the effect and called `setViewport`, pulling the view back and potentially oscillating on oversized nodes.

3. Sidebar action clarity bug:
   - Rename and duplicate buttons rendered raw letters `R` and `D`.
   - Delete was a CSS pseudo-element cross, not an explicit icon, making the row visually inconsistent.

4. Codex follow-up P2:
   - The first Codex pass after the initial implementation correctly flagged that no-dimension callers would now expand against the fallback 800x600 canvas and could clip smaller embedded canvases.
   - Fix: no-dimension fallback remains capped at zoom 1, while CanvasView supplies real dimensions for toolbar and keyboard fit actions.

5. Production smoke follow-up:
   - A post-deploy smoke test showed that the selected saved map still fitted too small when outline branches were collapsed.
   - Root cause: `fitToScreen` included positioned descendants hidden under collapsed nodes, so invisible far-away children inflated the bounding box.
   - Fix: fit bounds now walk only visible nodes from the root and stop at collapsed branches.

6. Browser QA follow-up from Andrey:
   - Real browser testing on production showed `Fit to screen` could still crop the map vertically. The top or bottom node could land exactly on, or outside, the canvas edge.
   - Root cause: the React measurement pipeline used `ResizeObserverEntry.contentRect`, which excludes CSS padding and borders from `.mml-node`; `fitToScreen` therefore under-counted node boxes. It also did not push initial DOM measurements into the editor until the asynchronous ResizeObserver callback fired.
   - Fix: measurements now use the rendered border box (`borderBoxSize` / `offsetWidth` / computed fallback), initial node measures are flushed immediately, and fit uses a 24px padding when real canvas dimensions are supplied.
   - The left saved-map list overflow was caused by a flex item with `min-width: auto`; the title button refused to shrink and pushed the action icon group outside the panel. Fix: the desktop saved-map sidebar is wider, session rows/title buttons have `min-width: 0`, the action group stays inside the row, and the responsive breakpoint moves to 960px so the wider sidebar cannot clip the toolbar on narrow desktop/tablet widths.
   - The premature `+C`, `+S`, `Del`, outline search, and outline collapse/expand-all controls were removed from the demo UI.

## TDD Evidence

### RED

Commands:

```bash
pnpm exec vitest run --project core packages/core/tests/editor.test.ts
pnpm exec vitest run --project react packages/react/tests/CanvasView.test.tsx
pnpm exec vitest run --project demo demo/tests/App.test.tsx
pnpm test:browser
```

Failures observed before production-code changes:

```text
core_exit=1
MindmapEditor fitToScreen > expands small maps instead of capping fit zoom at 1
AssertionError: expected 1 to be greater than 1

react_exit=1
CanvasView pan/zoom > does not auto-pan back when viewport changes without a selection change
AssertionError: expected { x: 40, y: 40, zoom: 1 } to deeply equal { x: -1000, y: -1000, zoom: 1 }

demo_exit=1
App session list actions > uses icons instead of ambiguous letter labels for row actions
AssertionError: expected 'R' not to be 'R'

browser_exit=1
Playwright fit-to-screen: Strategy & operating model top expected >= 8, received 0/-74.375
Playwright saved-map rows: actionsRight expected <= rowRight, received 361.609375 > 283; stricter follow-up title fit check expected >= 227, received 149 before widening sidebar
Playwright responsive follow-up: workspace stack expected mapTop >= sidebarBottom at 900px, received 72 < 704 before raising breakpoint
Playwright controls: Add child expected count 0, received 1

react_measurement_exit=1
CanvasView pan/zoom > measures rendered node border boxes so fit-to-screen includes padding and borders
AssertionError: expected { width: 72, height: 46 } to deeply equal { width: 96, height: 64 }
```

Additional regression coverage after Codex P2 and browser QA:

```text
MindmapEditor fitToScreen > keeps the no-dimension fallback capped at 1
MindmapEditor fitToScreen > ignores descendants hidden under collapsed nodes when fitting
CanvasView pan/zoom > measures rendered node border boxes so fit-to-screen includes padding and borders
useKeyboard additional > Cmd+0 fits to screen using real canvas dimensions when available
Playwright: fit to screen keeps every rendered node inside the browser canvas with breathing room
Playwright: saved map rows keep current titles and actions inside the left panel
Playwright: workspace stacks before the wider saved-map sidebar can clip toolbar controls
Playwright: demo does not expose node-editing or outline-toolbar controls prematurely
```

### GREEN

Focused commands after fixes:

```bash
pnpm exec vitest run --project core packages/core/tests/editor.test.ts
pnpm exec vitest run --project react packages/react/tests/CanvasView.test.tsx packages/react/tests/useKeyboard-additional.test.tsx
pnpm exec vitest run --project demo demo/tests/App.test.tsx
```

Focused result:

```text
core: 1 file passed, 42 tests passed
react: CanvasView 27 tests passed; CanvasView + useKeyboard-additional 42 tests passed
demo: 1 file passed, 4 tests passed
browser: 4 Playwright tests passed in Chromium
```

## Full Verification

Commands:

```bash
pnpm run ci
pnpm test:browser
pnpm --filter @mindmaplib/demo build
git diff --check
```

Result:

```text
pnpm run ci: passed
Test Files 28 passed (28)
Tests 298 passed (298)
pnpm test:browser: passed, 4 Playwright tests passed
pnpm --filter @mindmaplib/demo build: passed
git diff --check: passed
```

Known existing warnings:

```text
[tiptap warn]: Duplicate extension names found: ['link']
pnpm warning reading /Users/hermes/Library/Preferences/pnpm/rc
Vite chunk-size warning for the demo bundle
```

## Codex Review Status

Codex review round 1 initially completed and produced a P2 finding about no-dimension `fitToScreen()` callers. The finding was fixed and covered by tests.

Browser-QA follow-up review results:

```text
round 1: No actionable correctness issues were found in the diff. Format, lint, typecheck, unit tests, and the demo build passed locally.
round 2: P2 finding — the widened sidebar could clip toolbar controls at 861–900px before the mobile layout breakpoint activated.
fix: added a 900px browser regression test and raised the stacked-layout breakpoint to 960px.
final round 1: No discrete correctness, layout, or test issues were found in the changes relative to the base commit.
final round 2: The changes are limited to demo layout CSS, browser tests, and audit documentation. No discrete correctness issue was found.
```
