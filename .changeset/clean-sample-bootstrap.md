---
"@mindmaplib/core": patch
---

Add MindmapEditor.markSaved() for marking the current document revision clean after host-managed persistence. Keep canonical updateContent no-ops out of history, normalize noncanonical stored content, use one canonical empty-content shape, and merge structural edits with their derived layout so undo and redo restore a coherent tree.
