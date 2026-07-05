# MML-D-0001 — Demo Application for demo.tripleadigital.io

Status: draft
Created: 2026-07-05
Owner: Andrey

## Problem

mindmaplib core engine is built (@mindmaplib/core, 14+ tests, codex review x3).
The React adapter (@mindmaplib/react) does not exist yet. We need a live demo
that proves the library works as advertised: embeddable, interactive, production-
grade. The demo is the first real consumer of the public API.

## Goal

A standalone demo app at demo.tripleadigital.io that lets visitors interact
with a mindmap built on @mindmaplib/core. The demo must:

1. Prove embeddability — the entire app is a consumer of the library, nothing more.
2. Showcase core features: canvas view, node CRUD, keyboard nav, layout modes,
   undo/redo, serialize/deserialize, import/export.
3. Look production-grade — dark theme consistent with tripleadigital.io portal
   (#080e27 base, Inter font), not a toy playground.
4. Deploy automatically on push to main via GitHub Actions → Cloudflare Pages.

## Non-Goals

- React adapter (@mindmaplib/react) is NOT a prerequisite. The demo uses
  @mindmaplib/core directly with vanilla TypeScript. If/when the React adapter
  ships, the demo can migrate, but it must not block on it.
- Authentication — demo is public, no login.
- Persistence — demo uses InMemoryStore. No backend, no database.
- Mobile-first — desktop-first, responsive is nice-to-have.

## Tech Stack

- Build: Vite 7+ (already referenced in AGENTS.md as the demo's tooling)
- Framework: vanilla TypeScript (no React dependency for demo v1)
- Rendering: SVG edges + HTML content layer (per architecture in AGENTS.md)
- Styling: CSS custom properties, dark theme, Inter font from Google Fonts
- Package manager: pnpm (workspace member — already in pnpm-workspace.yaml)
- Deploy: Cloudflare Pages (new project: mindmaplib-demo)

## Package Structure

```
mindmaplib/
├── packages/core/        # @mindmaplib/core (built)
├── packages/react/       # @mindmaplib/react (future)
└── demo/                 # THIS SPEC — new package
    ├── package.json      # "name": "demo", "private": true
    ├── index.html        # Vite entry
    ├── src/
    │   ├── main.ts       # App bootstrap: create doc, editor, render loop
    │   ├── canvas.ts     # SVG + HTML two-layer viewport (pan/zoom/edges/nodes)
    │   ├── outline.ts    # Outline panel (hierarchical list, synced)
    │   ├── toolbar.ts    # Layout mode switch, undo/redo, export/import
    │   ├── keyboard.ts   # Keyboard navigation handler
    │   └── styles.css    # Dark theme, Inter, responsive
    └── vite.config.ts    # Vite config, build output to dist/
```

### Boundary Rules (CI-enforced)

demo/ MAY import from @mindmaplib/core.
demo/ MUST NOT reach into packages/core/src/ internals — only public exports
from dist/ via the workspace package link.

If demo needs something from core that is not in the public exports, the public
API has a gap — fix the API, do not reach into internals.

## Feature Breakdown

### F1: Canvas View (core)

- SVG layer: edges between parent-child nodes, grid background, viewport transform
- HTML layer: absolutely positioned node divs with content
- Pan: drag on empty canvas space
- Zoom: mouse wheel, zoom-to-fit button
- Node drag: reposition (sets manualPosition, switches to free-float mode)
- Node double-click: enter edit mode (contenteditable on the node's HTML)

### F2: Node CRUD (core)

- Tab: add child to selected node
- Enter: add sibling
- Shift+Tab: promote (move up one level)
- Delete/Backspace: delete node (not root)
- Typing in edit mode: rich text (bold/italic/code via keyboard shortcuts)

### F3: Outline Panel (core)

- Side panel with hierarchical indented list
- Collapse/expand nodes
- Click node in outline → focus in canvas
- Drag-and-drop reparenting in outline

### F4: Layout Modes (core)

- Toolbar buttons: Free-float / Tree Horizontal / Tree Vertical / Radial
- Switching layout calls computeLayoutOps() and applies via transaction
- Free-float respects manualPosition, auto-layouts discard it

### F5: Undo/Redo (core)

- Ctrl+Z / Ctrl+Shift+Z
- Toolbar buttons with disabled state at history bounds

### F6: Serialize / Import-Export (core)

- Export JSON: downloads serialize(doc) as .mmp.json
- Import JSON: file picker, deserialize, replace current doc
- Export Markdown: flatten tree to indented markdown outline
- Auto-save to localStorage (debounced 2s) — survives reload

### F7: Sample Content

- Pre-loaded sample mindmap on first visit: "Building a SaaS Product" tree
  with 15-20 nodes across 3 levels, demonstrating rich-text content
- Reset button to restore sample

## Deploy Pipeline

### Cloudflare Pages Setup

1. New CF Pages project: `mindmaplib-demo`
2. Build command: `pnpm --filter demo build`
3. Build output: `demo/dist/`
4. Custom domain: `demo.tripleadigital.io` (CNAME → mindmaplib-demo.pages.dev)
5. CF account: ca736f2df3f666a941492679c231c291
6. DNS: add CNAME record demo → mindmaplib-demo.pages.dev in tripleadigital.io zone

### GitHub Actions

```yaml
# .github/workflows/deploy-demo.yml
name: Deploy Demo
on:
  push:
    branches: [main]
    paths: ['demo/**', 'packages/core/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mindmaplib/core build
      - run: pnpm --filter demo build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy demo/dist --project-name=mindmaplib-demo
```

Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (same values as
tripleadigital-site repo).

## Development Workflow

Follows AGENTS.md + docs/runbooks/DEVELOPMENT_PROCESS.md:

1. TDD: red-green for canvas rendering, keyboard handlers, layout switching
2. No any in production TS, strict mode
3. CI gate: pnpm ci (format + lint + typecheck + test + boundaries)
4. 2 rounds codex review before merge
5. Changeset for any public API changes to core (demo itself is not published)

## Verification

- [ ] pnpm install works with new demo/ package
- [ ] pnpm --filter demo dev serves on localhost:5173
- [ ] Canvas renders sample mindmap with edges
- [ ] Tab/Enter/Delete keyboard nav works
- [ ] Layout mode switch repositions nodes
- [ ] Undo/redo works
- [ ] Export JSON downloads file
- [ ] pnpm --filter demo build produces demo/dist/
- [ ] Deploy to CF Pages succeeds
- [ ] demo.tripleadigital.io loads and is interactive
- [ ] Boundary check passes (demo imports only from @mindmaplib/core public API)

## Implementation Order

1. Scaffold demo/ package (package.json, vite.config.ts, index.html)
2. F7 sample content + basic canvas render (prove core API consumption)
3. F1 full canvas (pan/zoom/edges/nodes/drag)
4. F2 keyboard CRUD
5. F5 undo/redo + toolbar
6. F4 layout modes
7. F3 outline panel
8. F6 import/export
9. CF Pages project + domain + GitHub Actions
10. End-to-end verification
