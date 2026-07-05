# Demo Application Specification

Status: accepted.
Date: 2026-07-05.
Owner: Andrey.
Spec-ID: MML-B-0006.
Spec-Version: 1.0.0+backlog.0006.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Context

The mindmaplib `demo/` package is a standalone Vite application that proves the
library works as a drop-in embeddable engine. A visitor interacts with a live
mindmap: canvas rendering, keyboard navigation, undo/redo, layout modes, and
D1-backed session persistence.

## Goals

- Live, interactive mindmap canvas rendered from `@mindmaplib/core`.
- Keyboard-driven node operations: add child, add sibling, delete, edit text,
  undo/redo.
- Multiple layout modes: tree-horizontal, tree-vertical, radial.
- Session persistence via Cloudflare D1: create, load, auto-save.
- Visual style matching `tripleadigital.io` (light theme, Inter typeface,
  navy accent).
- Deployed at `mapdemo.tripleadigital.io` via native CF Pages git integration.

## Non-Goals

- Multi-user real-time collaboration (reserved for future work).
- Rich-text TipTap editing (plain-text node labels in this iteration).
- Drag-and-drop node reparenting (keyboard move only).
- Custom themes or dark mode.
- Authentication or per-user scoping (sessions are public, shared).

## Architecture

```
demo/
  src/
    main.ts              — bootstrap, editor wiring, keyboard handler
    canvas.ts            — SVG edges + HTML node rendering, pan/zoom viewport
    d1store.ts           — MindmapStore impl backed by /api/* Pages Function
    sample.ts            — initial sample document factory
    content.ts           — NodeContent <-> plain text helpers
    style.css            — light theme, tripleadigital.io design tokens
  functions/
    api/
      sessions.ts        — Pages Function: GET/POST/DELETE /api/sessions[/:id]
  index.html             — Vite entry shell
  package.json           — @mindmaplib/demo (private, workspace)
  tsconfig.json
  vite.config.ts
  wrangler.toml          — D1 binding for local dev (NOT for deploy)
```

### Persistence flow

```
Browser ──fetch──▶ Pages Function (/api/sessions) ──D1 binding──▶ D1 (mindmap-demo)
                          ▲
                    wrangler.toml env.MINDMAP_DB
```

The browser-side `D1Store` implements `MindmapStore` by calling the Pages
Function REST API. Auto-save triggers on `editor.subscribe` after a debounce
window (2s). The D1 row stores the full `SerializedDoc` JSON string with
optimistic-concurrency version check.

### D1 schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Mindmap',
  doc_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
```

## API Surface (Pages Function)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/sessions` | — | `MindmapDocMeta[]` |
| POST | `/api/sessions` | `{doc: SerializedDoc}` | `{id, title, version}` (creates if no id) |
| GET | `/api/sessions/:id` | — | `{doc: SerializedDoc}` |
| PUT | `/api/sessions/:id` | `{doc: SerializedDoc, expectedVersion}` | `{saved, conflict, currentVersion}` |
| DELETE | `/api/sessions/:id` | — | `{deleted: true}` |

## Design tokens (from tripleadigital.io)

```css
--paper:   #f6f4ef;  /* page background */
--card:    #ffffff;  /* node background */
--ink:     #16181d;  /* node text */
--text:    #4c4f57;  /* body text */
--muted:   #9b9da4;  /* secondary text */
--accent:  #21426f;  /* navy accent, root node, selection */
--line:    #e6e2d9;  /* node border, canvas edges */
--shadow:  0 1px 2px rgba(22,24,29,0.04), 0 14px 32px -18px rgba(22,24,29,0.16);
font: 'Inter', -apple-system, sans-serif;
```

## Acceptance Criteria

1. **Canvas**: nodes render as rounded rectangles at their computed positions.
   Edges are smooth Bézier curves connecting parent → child. Root node is
   visually distinct (accent border).
2. **Pan/zoom**: mouse drag pans the canvas. Scroll wheel zooms. "Fit" button
   resets viewport to fit all nodes.
3. **Keyboard**: Tab adds a child, Enter adds a sibling, Delete removes the
   selected node (not root), Space/Enter starts editing, Escape stops. Ctrl+Z
   undo, Ctrl+Shift+Z redo.
4. **Layout modes**: three buttons switch between tree-horizontal,
   tree-vertical, radial. Positions recompute on switch.
5. **Persistence**: "New" creates a fresh session in D1. URL updates to
   `/?id=<sessionId>`. Auto-save fires 2s after last edit. Reloading the URL
   restores the saved document.
6. **Session list**: visiting `/` (no id) shows a list of saved sessions with
   title + last-updated, plus a "New mindmap" button.
7. **Style**: light theme using the design tokens above. Inter font.
   Node text is readable at default zoom.
8. **Deploy**: `mapdemo.tripleadigital.io` serves the built app. Git push to
   `main` triggers automatic rebuild.

## Test Plan

- **Unit**: `content.ts` helpers (text ↔ NodeContent round-trip).
- **E2E (Playwright)**: load `/`, create a node, switch layout, verify node
  count in DOM, create session, reload, verify persistence.

## Changelog

- 1.0.0+backlog.0006: Initial accepted spec.
