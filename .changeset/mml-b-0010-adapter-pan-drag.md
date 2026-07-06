---
'@mindmaplib/react': minor
---

Fix canvas pan and node drag in real browsers (MML-B-0010).

Root cause: missing `e.preventDefault()` on mousedown allowed native text selection and native drag-and-drop to suppress mousemove events in real browsers. Tests passed in jsdom (no selection mechanism) but failed in Chrome/Safari/Firefox.

Fixes:
- F1: `e.preventDefault()` on both canvas and node mousedown
- F2: CSS `user-select: none` + `-webkit-user-drag: none` on `.mml-canvas`
- F4: `handleMouseDown` reads `doc` from `docRef` instead of closure — all handlers now stable
- F5: `NodeView.onMouseDown` calls `e.preventDefault()` (lets event bubble for drag start)
