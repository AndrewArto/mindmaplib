# Change Evidence: demo fit-to-screen and sidebar action icons

Date: 2026-07-09
Agent: Stevens
Request/issue: ship follow-up fixes for two production demo issues reported by Andrey: fit-to-screen leaves small maps tiny on the canvas, and sidebar row actions use ambiguous letter labels (`R`, `D`) instead of clear icons. Also address Codex review P1 about selected-node auto-pan fighting user pan/zoom.

## Scope

- User-visible changes:
  - Fit to screen can scale small maps up when the caller provides real canvas dimensions.
  - No-dimension `fitToScreen()` fallback remains capped at zoom 1 to avoid clipping embedded canvases.
  - Demo toolbar and keyboard Cmd/Ctrl+0 pass the actual canvas size into `fitToScreen` where available.
  - Sidebar session actions use SVG icons: pencil for rename, copy for duplicate, and cross for delete.
  - Selected-node auto-pan no longer reacts to every viewport update, so user pan/zoom is not pulled back.
- Files changed:
  - `packages/core/src/editor.ts`
  - `packages/core/tests/editor.test.ts`
  - `packages/react/src/CanvasView.tsx`
  - `packages/react/src/hooks/useKeyboard.ts`
  - `packages/react/tests/CanvasView.test.tsx`
  - `packages/react/tests/useKeyboard-additional.test.tsx`
  - `demo/src/App.tsx`
  - `demo/src/icons.tsx`
  - `demo/src/style.css`
  - `demo/tests/App.test.tsx`
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

## TDD Evidence

### RED

Commands:

```bash
pnpm exec vitest run --project core packages/core/tests/editor.test.ts
pnpm exec vitest run --project react packages/react/tests/CanvasView.test.tsx
pnpm exec vitest run --project demo demo/tests/App.test.tsx
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
```

Additional regression coverage after Codex P2:

```text
MindmapEditor fitToScreen > keeps the no-dimension fallback capped at 1
useKeyboard additional > Cmd+0 fits to screen using real canvas dimensions when available
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
core: 1 file passed, 41 tests passed
react: 2 files passed, 41 tests passed
demo: 1 file passed, 4 tests passed
```

## Full Verification

Commands:

```bash
pnpm run ci
pnpm --filter @mindmaplib/demo build
git diff --check
```

Result:

```text
pnpm run ci: passed
Test Files 28 passed (28)
Tests 296 passed (296)
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

A subsequent review attempt after the fix is currently blocked by local Codex CLI authentication on the Mac mini:

```text
codex login status: Logged in using an API key
codex review: 401 Unauthorized, invalid_api_key
```

No API key value was printed or recorded here. Review rounds 1 and 2 after the P2 fix still need to be rerun after Codex is reauthenticated with a valid ChatGPT login or valid API key.
