# Demo Application Specification

Status: accepted.
Date: 2026-07-05.
Owner: Andrey.
Spec-ID: MML-B-0006.
Spec-Version: 2.0.0+backlog.0006.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Context

The mindmaplib `demo/` package is a standalone Vite + React application that
proves the library works as a drop-in embeddable engine. It is a **thin
consumer** of `@mindmaplib/react` and `@mindmaplib/core` — it does NOT
reimplement canvas rendering, rich text editing, keyboard navigation, or
outline view. Those live in the React adapter (`@mindmaplib/react`).

The demo owns only what is specific to this deployment: session persistence
(D1), the app shell (toolbar, session list), and visual styling.

## Goals

- Consume `@mindmaplib/react`'s `<Mindmap>` component for the full interactive
  canvas: node rendering, rich text editing (TipTap), keyboard navigation,
  pan/zoom, layout modes, and outline view.
- Consume `@mindmaplib/core`'s `MindmapEditor` and `MindmapStore` interface
  for document state management.
- Session persistence via Cloudflare D1: create, load, auto-save, delete.
- Visual style matching `tripleadigital.io` (light theme, Inter typeface,
  navy accent).
- Deployed at `mapdemo.tripleadigital.io` via native CF Pages git integration.

## Non-Goals

- Reimplementing any rendering, editing, navigation, or layout logic that
  belongs in `@mindmaplib/core` or `@mindmaplib/react`.
- Multi-user real-time collaboration (reserved for future work).
- Drag-and-drop node reparenting (keyboard move only in this iteration).
- Custom themes or dark mode.
- Authentication or per-user scoping (sessions are public, shared).

## Architecture

```
demo/
  src/
    main.tsx            — React mount point, Vite entry
    App.tsx             — app shell: toolbar, session list, <Mindmap> host
    D1Store.ts          — MindmapStore impl backed by /api/* Pages Function
    style.css           — light theme, tripleadigital.io design tokens
  worker.ts             — CF Pages advanced-mode worker (D1 REST API)
  build-worker.mjs      — esbuild: compiles worker.ts → dist/_worker.js
  _routes.json          — CF Pages routing (_worker.js handles /api/*)
  index.html            — Vite entry shell
  package.json          — @mindmaplib/demo (private, workspace)
  tsconfig.json
  vite.config.ts
```

### What the demo owns (its responsibility)

| Concern                        | Where                          | How                                                    |
| ------------------------------ | ------------------------------ | ------------------------------------------------------ |
| Session persistence            | `D1Store.ts`, `worker.ts`      | Implements `MindmapStore` interface from core          |
| App shell (toolbar, buttons)   | `App.tsx`                      | React components wrapping `<Mindmap>`                  |
| Session list UI                | `App.tsx`                      | Lists D1 sessions, new/load/delete                     |
| Design tokens / styling        | `style.css`                    | CSS custom properties, passed to `<Mindmap>` via props |
| Build & deploy pipeline        | `build-worker.mjs`, CF Pages   | Vite build + esbuild worker, CF Pages git integration  |
| Auto-save orchestration        | `App.tsx`                      | Debounced `editor.save()` on state change              |

### What the demo does NOT own (delegated to the library)

| Concern                        | Owner                          | Demo usage                                             |
| ------------------------------ | ------------------------------ | ------------------------------------------------------ |
| Canvas rendering (SVG + HTML)  | `@mindmaplib/react`            | `<Mindmap>` component                                  |
| Rich text editing (TipTap v3)  | `@mindmaplib/react`            | `<Mindmap>` component, managed internally              |
| Node content ↔ HTML rendering  | `@mindmaplib/react` + TipTap   | `generateHTML()` with StarterKit extension list         |
| HTML sanitization              | `@mindmaplib/react`            | DOMPurify on `generateHTML()` output                   |
| Keyboard navigation            | `@mindmaplib/react`            | `useKeyboard` hook inside `<Mindmap>`                  |
| Outline view                   | `@mindmaplib/react`            | `<Mindmap>` with `showOutline` prop                    |
| Pan / zoom / viewport          | `@mindmaplib/react`            | `<Mindmap>` component                                  |
| Layout computation             | `@mindmaplib/core`             | `editor.setLayout(mode)` → `computeLayoutOps`          |
| Undo / redo                    | `@mindmaplib/core`             | `MindmapEditor` ring buffer                            |
| Document model & transactions  | `@mindmaplib/core`             | `MindmapEditor`, `Transaction`, `TransactionOp`        |

### Integration point

The demo creates a `MindmapEditor` (from core) with a `D1Store` instance, then
renders `<Mindmap editor={editor} />` (from react adapter). The adapter handles
all interaction. The demo listens to editor state for save orchestration and
toolbar button states.

```tsx
// App.tsx — conceptual
import { MindmapEditor, createDoc } from '@mindmaplib/core'
import { Mindmap } from '@mindmaplib/react'
import { D1Store } from './D1Store'

const store = new D1Store()
const editor = new MindmapEditor(createDoc('New Mindmap'), { store })

function App() {
  // Session management, toolbar, auto-save orchestration
  return <Mindmap editor={editor} showOutline layoutMode="tree-horizontal" />
}
```

### Persistence flow

```
Browser ──fetch──▶ Pages Function (/api/sessions) ──D1 binding──▶ D1 (mindmaplib-demo)
                          ▲
                    MINDMAP_DB binding (configured via CF API, NOT wrangler.toml)
```

The browser-side `D1Store` implements `MindmapStore` by calling the Pages
Function REST API. Auto-save triggers on `editor.subscribe` after a debounce
window (2s). The D1 row stores the full `SerializedDoc` JSON string with
optimistic-concurrency version check.

The D1 binding (`MINDMAP_DB`) is configured via Cloudflare API on the Pages
project. **No `wrangler.toml` anywhere.**

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

| Method | Path                | Body                                    | Response                                  |
| ------ | ------------------- | --------------------------------------- | ----------------------------------------- |
| GET    | `/api/sessions`     | —                                       | `MindmapDocMeta[]`                        |
| POST   | `/api/sessions`     | `{doc: SerializedDoc}`                  | `{id, title, version}` (creates if no id) |
| GET    | `/api/sessions/:id` | —                                       | `{doc: SerializedDoc}`                    |
| PUT    | `/api/sessions/:id` | `{doc: SerializedDoc, expectedVersion}` | `{saved, conflict, currentVersion}`       |
| DELETE | `/api/sessions/:id` | —                                       | `{deleted: true}`                         |

## Design tokens (from tripleadigital.io)

```css
--paper: #f6f4ef; /* page background */
--card: #ffffff; /* node background */
--ink: #16181d; /* node text */
--text: #4c4f57; /* body text */
--muted: #9b9da4; /* secondary text */
--accent: #21426f; /* navy accent, root node, selection */
--line: #e6e2d9; /* node border, canvas edges */
--shadow:
  0 1px 2px rgba(22, 24, 29, 0.04), 0 14px 32px -18px rgba(22, 24, 29, 0.16);
font:
  'Inter',
  -apple-system,
  sans-serif;
```

These tokens are defined in the demo's `style.css` and passed to the `<Mindmap>`
component as CSS custom properties on the host element. The adapter respects
inherited custom properties — the demo does not override adapter internals.

## Acceptance Criteria

1. **Canvas** (via adapter): nodes render as rounded rectangles at their
   computed positions. Edges are smooth Bezier curves connecting parent to
   child. Root node is visually distinct (accent border).
2. **Rich text** (via adapter): double-click a node to edit. Bold (Cmd+B),
   italic (Cmd+I), code, headings (H1-H3), bullet/ordered lists, links. Escape
   exits edit mode. Non-editing nodes display rendered rich text HTML
   (sanitized via DOMPurify).
3. **Pan/zoom** (via adapter): mouse drag pans the canvas. Scroll wheel zooms.
   Fit button resets viewport to fit all nodes.
4. **Keyboard** (via adapter): Tab adds a child, Enter adds a sibling, Delete
   removes the selected node (not root), Space/F2 starts editing, Escape stops.
   Cmd+Z undo, Cmd+Shift+Z redo. Arrow keys navigate the tree.
5. **Layout modes** (via adapter + core): three buttons switch between
   tree-horizontal, tree-vertical, radial. Positions recompute on switch.
6. **Outline** (via adapter): toggle button shows/hides hierarchical outline.
   Clicking an item selects the node in canvas. Collapse/expand branches.
7. **Persistence** (demo-owned): New creates a fresh session in D1. URL updates
   to `/?id=<sessionId>`. Auto-save fires 2s after last edit. Reloading the URL
   restores the saved document.
8. **Session list** (demo-owned): visiting `/` (no id) shows a list of saved
   sessions with title + last-updated, plus a New button.
9. **Style**: light theme using the design tokens above. Inter font. Node text
   is readable at default zoom.
10. **Deploy**: `mapdemo.tripleadigital.io` serves the built app. Git push to
    `main` triggers automatic rebuild.

## Test Plan

- **Unit** (demo-owned code only):
  - `D1Store.ts`: CRUD operations against the Pages Function API.
  - Auto-save debounce logic.
- **E2E (Playwright)**: load `/`, create a node, type rich text, bold it,
  switch layout, toggle outline, verify node count in DOM, create session,
  reload, verify persistence. Rich text, canvas, outline behavior tested
  through the adapter integration.

## Package Dependencies

```
@mindmaplib/core     — workspace dependency (engine, types, MindmapEditor)
@mindmaplib/react    — workspace dependency (Mindmap component, hooks)
react, react-dom     — peer dependencies (React 19)
```

The demo declares `@mindmaplib/core` and `@mindmaplib/react` as workspace
dependencies. It does NOT directly depend on TipTap, d3-hierarchy, or
DOMPurify — those are transitive through `@mindmaplib/react`.

## Build & Deploy

- **Build**: `pnpm install --frozen-lockfile && pnpm build && pnpm --filter demo build`
  - Core builds first (`tsup` → `dist/`), then demo (`vite build` + `esbuild` worker).
- **Output**: `demo/dist/` with `index.html`, `assets/`, `_worker.js`, `_routes.json`.
- **CF Pages**: native git integration on `main` branch. No wrangler.toml.
  D1 binding configured via Cloudflare API (`d1_databases` map format).

## Changelog

- 1.0.0+backlog.0006: Initial accepted spec (vanilla TS demo, no rich text).
- 2.0.0+backlog.0006: Rewritten as thin React consumer of @mindmaplib/react.
  Removed reimplemented canvas/content/outline/keyboard code. Rich text via
  TipTap now a goal (via adapter), not a non-goal. Architecture clarified:
  demo owns persistence + app shell only; all rendering/editing/navigation
  delegated to the library.
