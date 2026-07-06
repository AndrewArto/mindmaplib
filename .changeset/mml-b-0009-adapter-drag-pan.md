---
'@mindmaplib/react': patch
---

Fix canvas pan between nodes and node drag undo flooding (MML-B-0009 adapter).

- **A1**: Canvas pan now starts when clicking any non-node child element (SVG edges, background layers). Uses `closest('[data-node-id]')` null check instead of strict `target === currentTarget` or class-based detection.
- **A2**: Node drag uses `setPositionDirect()` during mousemove (no undo entry, no version bump) and `commitPosition()` on mouseup (single undo entry). Drag listeners moved to document-level so cursor can leave canvas bounds during drag without aborting. Removed `onMouseLeave` handler that killed drag prematurely.
