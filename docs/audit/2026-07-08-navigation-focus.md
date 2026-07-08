# Change Evidence: navigation focus behavior

Date: 2026-07-08
Agent: Stevens
Commit(s): see git history for this evidence file
Request/issue: Implement map navigation so opening focuses the last known node or root, arrow keys can reach every visible node, Delete/Backspace focuses parent after subtree deletion, new nodes enter text mode, Enter commits editing, single click focuses, double click edits, and deleting a parent removes children.

## Scope

- User-visible change: Map opens with a selected/focused node and canvas keyboard focus. The demo persists last focused node per document in localStorage and falls back to root if that node no longer exists.
- User-visible change: ArrowUp/ArrowDown now walk visible depth-first tree order; ArrowLeft/ArrowRight keep parent/child navigation. Hidden descendants under collapsed nodes are skipped.
- User-visible change: Delete/Backspace removes the selected subtree and selects the deleted node parent.
- User-visible change: Keyboard-created child/sibling nodes are selected and immediately enter editing. Enter in edit mode commits content, exits editing, keeps the node selected, and returns focus to canvas hotkeys.
- Existing behavior kept and tested: single click selects/focuses a node; double click starts editing; core deleteNode removes descendants.
- Package(s) affected: react adapter, demo shell, specs, tests. Core implementation unchanged.

## Files Changed

- demo/src/App.tsx
- demo/src/main.tsx
- docs/specs/MML-B-0001_CORE_ENGINE_SPEC.md
- docs/specs/MML-B-0002_FOCUS_MODES_SPEC.md
- docs/specs/MML-B-0007_REACT_ADAPTER_SPEC.md
- docs/specs/MML-D-0002_SHORTCUTS_PANEL_SPEC.md
- packages/react/src/CanvasView.tsx
- packages/react/src/Mindmap.tsx
- packages/react/src/NodeView.tsx
- packages/react/src/hooks/useKeyboard.ts
- packages/react/tests/CanvasView.test.tsx
- packages/react/tests/Mindmap-integration.test.tsx
- packages/react/tests/NodeView.test.tsx
- packages/react/tests/useKeyboard-additional.test.tsx
- packages/react/tests/useKeyboard.test.tsx

## Impact Analysis

- Symbols checked: Mindmap, CanvasView, NodeView/EditingNodeContent, useKeyboard, MindmapEditor select/startEditing/stopEditing/updateContent/deleteNode.
- Risk level: MEDIUM. The change is keyboard/focus behavior, not data schema.
- Public API signatures: unchanged.
- Persistence: demo-only localStorage key mindmaplib:last-focused-node:<docId>; stale ids are ignored and root is selected.
- Deletion semantics: core already deletes descendants; adapter now selects parent after deletion and relayouts auto-layout modes.
- Focus semantics: canvas receives DOM focus on mount when not already editing, TipTap receives focus in edit mode, and Enter/Escape restore canvas focus after edit exit.

## TDD Evidence

- Red test command: pnpm --filter @mindmaplib/react test -- tests/useKeyboard.test.tsx tests/useKeyboard-additional.test.tsx tests/Mindmap-integration.test.tsx --runInBand
- Red failure summary: 4 failures. Delete selected null instead of parent; ArrowDown/ArrowUp could not walk into descendants by visible tree order; opening a map with no selected node did not select root/focus canvas.
- Green focused command: pnpm --filter @mindmaplib/react test -- tests/useKeyboard.test.tsx tests/useKeyboard-additional.test.tsx tests/Mindmap-integration.test.tsx tests/CanvasView.test.tsx tests/NodeView.test.tsx --runInBand
- Green focused result: 13 test files, 132 tests passed.

## Verification

- Static security scan on added lines: no findings.
- Full local CI command: pnpm run ci
- Full local CI result: passed. format:check passed; lint passed with 0 errors and 1 pre-existing no-console warning before cleanup, then warning was removed; typecheck passed for core/react/demo; tests passed, 21 files and 271 tests; dependency-cruiser boundary check passed.
- Demo build command: pnpm --filter @mindmaplib/demo build
- Demo build result: passed. core/react tsup builds passed, Vite build passed, worker build passed.
- Node version used: /Users/andery-mini/.nvm/versions/node/v22.21.1/bin via PATH, matching .nvmrc=22.

## Known Warnings

- pnpm emits EACCES warnings while trying to read /Users/hermes/Library/Preferences/pnpm/rc. Commands still exit 0.
- Vitest emits existing jsdom/Tiptap warnings. Tests pass.
- Vite build emits the existing large chunk warning. Build passes.

## Review

- Codex review round 1: found two blocking issues: auto-layout Delete used two undo steps; click-away from editing could reselect the edited node instead of the clicked node. Both fixed with regression coverage.
- Codex review round 2: found two more focus/async issues: async Delete used stale layout mode; canvas autofocus could steal focus from TipTap when mounted already editing. Both fixed with regression coverage.
- Codex review round 3: found Escape edit-exit did not restore canvas focus. Fixed with regression coverage.
- Codex review round 4: no blocking correctness issues found.

## Changeset

- Added: no. No public API signature change; behavior change is within existing React adapter/demo UX.
