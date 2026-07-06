---
'@mindmaplib/core': patch
---

Fix radial layout collapse, setPosition undo flooding, and fitToScreen hardcoded dimensions (MML-B-0009).

- **C1**: Radial layout now uses `tree().nodeSize()` with polar coordinate conversion. Depth-1 ring radius is computed from circumference requirements so siblings never overlap.
- **C2**: Added `setPositionDirect()` (no undo entry, no version bump) and `commitPosition()` (single undo entry for entire drag). `setPosition()` is now an alias for `commitPosition()`.
- **C3**: `fitToScreen()` accepts optional `containerWidth`/`containerHeight` parameters. Falls back to 800×600 when omitted.
