# mindmaplib Core Engine Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0001.
Spec-Version: 0.1.0+backlog.0001.
Backlog lane: backlog.
Depends-on: none.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the architecture, data model, public API surface, technology stack, and
development constraints for mindmaplib — an embeddable mindmap engine for web
applications.

mindmaplib is a library, not a standalone application. Developers drop it into
their portals, dashboards, and products to get interactive mind maps backed by
their own storage layer. The first integration target is the TripleA Digital
portal (tripleadigital.io/portal).

## Goals

- Framework-agnostic TypeScript core (`@mindmaplib/core`).
- React adapter as first-class consumer (`@mindmaplib/react`).
- Two synchronized views on the same document: canvas (spatial) and outline
  (hierarchical).
- Rich text inside nodes via TipTap v3 (MIT core).
- Full keyboard navigation (Tab, Enter, arrows, shortcuts).
- Free-float layout with optional auto-layout modes (tree horizontal, tree
  vertical, radial).
- Immutable document model with transactional mutations and in-memory
  undo/redo.
- Storage-agnostic: host owns persistence, library exports a Store interface
  with an in-memory default implementation.
- MIT license, zero proprietary runtime dependencies.
- pnpm monorepo: core + react + demo.
- CI-enforced package boundary (react cannot leak into core).

## Non-Goals

- Real-time multi-user collaboration. Architecture leaves the door open
  (immutable model, serializable state, transactional mutations), but no CRDT,
  no WebSocket layer, no presence in this spec.
- Mobile/touch support. Desktop-first, possibly desktop-only.
- Import/export to external formats (Markdown, OPML, FreeMind). JSON-only.
- Orphan nodes. One tree, one root. Deleting a node deletes its subtree.
  Detach-without-attach is not supported.
- Server-side rendering of maps.
- Built-in persistence backend beyond the in-memory default.

## Technology Stack

Verified 2026-07-05. All runtime dependencies are MIT or MIT-compatible.

| Layer | Package | Version | License | Rationale |
|-------|---------|---------|---------|-----------|
| Language | TypeScript | 5.x (strict) | Apache-2.0 | Type safety, IDE support, ecosystem |
| Rich text | @tiptap/core, @tiptap/pm, @tiptap/starter-kit | ^3.0 | MIT | Headless, framework-agnostic, MIT core |
| Layout math | d3-hierarchy | ^3.1 | ISC | Pure layout algorithms, no DOM, MIT-compatible |
| Framework adapter | React | ^19 | MIT | First integration target is a React app |
| Monorepo | pnpm workspaces | ^9 | MIT | Strict dependency boundaries, fast |
| Versioning | @changesets/cli | ^2 | MIT | OSS monorepo standard, npm publish automation |
| Boundaries | dependency-cruiser | ^18 | MIT | CI-enforced package isolation |
| Testing | vitest | ^2 | MIT | Fast, ESM-native, monorepo-friendly |
| Library bundling | tsup | ^8 | MIT | Zero-config TS library builds |
| Demo bundling | vite | ^6 | MIT | Fast dev server, standard for React demos |

### License Verification Notes

- TipTap v3 core (`@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`) is MIT.
  TipTap Pro extensions (collaboration cursor, etc.) are commercial and MUST
  NOT be used.
- `generateHTML` is exported from `@tiptap/core` (browser-only context). This
  is part of the MIT-licensed core, not a Pro feature. It converts TipTap JSON
  to static HTML without an editor instance.
- d3-hierarchy is ISC-licensed. ISC is functionally equivalent to MIT
  (permissive, no copyleft). Compatible with an MIT project.
- dependency-cruiser and changesets are devDependencies (not shipped to
  consumers), but both are MIT regardless.

## Document Model

The document is an immutable tree represented as a flat node map. Tree
structure emerges from `parentId` relationships. There is exactly one root
node.

```typescript
interface MindmapDoc {
  id: string
  rootId: string
  nodes: Record<string, MindmapNode>
  version: number
  meta: {
    title: string
    created: string  // ISO 8601
    updated: string  // ISO 8601
  }
}

interface MindmapNode {
  id: string
  parentId: string | null  // null only for root
  position: { x: number; y: number } | null  // null = auto-layout will compute
  content: TipTapJSON      // ProseMirror/TipTap JSON document fragment
  collapsed: boolean       // collapsed in outline and canvas
}
```

### Design Decisions

Flat node map (not nested tree). Reasons:

- O(1) lookup by id.
- O(1) attach/detach (flip `parentId`).
- Trivial serialization (plain JSON, no cycles).
- Outline and canvas both build a tree from the flat map via a single
  traversal.
- No deep-clone complexity on immutable updates — replace one entry in the
  record, not a path through a nested structure.

`position` is nullable. When null, the layout engine computes coordinates on
the next layout pass. When the user drags a node, `position` is set to explicit
coordinates and auto-layout no longer touches that node (manual override).

`content` is TipTap JSON (a ProseMirror document fragment). This is plain
serializable JSON. The library does not store or serialize HTML.

`version` is a monotonically increasing integer. The host can use it for
optimistic concurrency. The library increments it on every transaction.

One root, no orphans. `parentId: null` is valid only for the root node. Node
deletion removes the entire subtree.

### Immutability

`MindmapDoc` is treated as immutable. Every mutation produces a new document
object (structural sharing: unchanged branches keep their references). Views
(canvas, outline) subscribe to document state and re-render on change. This is
the foundation for undo/redo and future collaboration.

### Transactions

All mutations flow through a transaction layer:

```typescript
interface Transaction {
  apply(doc: MindmapDoc): MindmapDoc
}
```

The core maintains an undo stack (ring buffer, default 100 entries) and a redo
stack. Each transaction, when applied, pushes the previous document state onto
the undo stack. Undo pops undo, pushes to redo. Redo pops redo, pushes to undo.

Built-in transactions:

- `addNode(doc, parentId, node?)` — create child of parentId.
- `deleteNode(doc, nodeId)` — delete node and its subtree.
- `moveNode(doc, nodeId, newParentId)` — reparent node.
- `updateNodeContent(doc, nodeId, content)` — replace node content.
- `setNodePosition(doc, nodeId, position)` — set explicit coordinates.
- `toggleNodeCollapsed(doc, nodeId)` — collapse/expand.

## Public API Surface (core)

```typescript
// @mindmaplib/core

// --- Document ---
function createDoc(title: string): MindmapDoc
function createNode(parentId: string, content?: TipTapJSON): MindmapNode

// --- Tree operations (pure, return new doc) ---
function addNode(doc: MindmapDoc, parentId: string, node?: Partial<MindmapNode>): MindmapDoc
function deleteNode(doc: MindmapDoc, nodeId: string): MindmapDoc
function moveNode(doc: MindmapDoc, nodeId: string, newParentId: string): MindmapDoc
function updateNodeContent(doc: MindmapDoc, nodeId: string, content: TipTapJSON): MindmapDoc
function setNodePosition(doc: MindmapDoc, nodeId: string, position: { x: number; y: number }): MindmapDoc
function toggleNodeCollapsed(doc: MindmapDoc, nodeId: string): MindmapDoc

// --- Queries (pure, read-only) ---
function getNode(doc: MindmapDoc, nodeId: string): MindmapNode | undefined
function getChildren(doc: MindmapDoc, nodeId: string): MindmapNode[]
function getDescendants(doc: MindmapDoc, nodeId: string): MindmapNode[]
function getPath(doc: MindmapDoc, nodeId: string): MindmapNode[]  // root → node
function getAncestors(doc: MindmapDoc, nodeId: string): MindmapNode[]

// --- Layout ---
type LayoutMode = 'free-float' | 'tree-horizontal' | 'tree-vertical' | 'radial'
function computeLayout(doc: MindmapDoc, mode: LayoutMode): MindmapDoc  // fills null positions

// --- Serialization ---
function serialize(doc: MindmapDoc): string  // JSON string
function deserialize(json: string): MindmapDoc

// --- Editor (stateful, holds undo/redo) ---
class MindmapEditor {
  constructor(initialDoc: MindmapDoc, store?: MindmapStore)
  getDoc(): MindmapDoc
  apply(tx: Transaction): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  subscribe(listener: (doc: MindmapDoc) => void): () => void  // returns unsubscribe
  setLayout(mode: LayoutMode): void
  destroy(): void
}

// --- Store interface (host-implemented) ---
interface MindmapStore {
  load(docId: string): Promise<MindmapDoc | null>
  save(doc: MindmapDoc): Promise<void>
  list(): Promise<MindmapDocMeta[]>
  delete(docId: string): Promise<void>
}

interface MindmapDocMeta {
  id: string
  title: string
  updated: string
}

// In-memory default implementation for dev/testing
class InMemoryStore implements MindmapStore { ... }
```

## Rendering Architecture

Two synchronized layers inside the canvas viewport. Both share a single
transform — when the user pans or zooms, one CSS `transform` update moves
everything.

### Layer 1: SVG

Renders edges (connection lines between parent and child nodes), selection
highlights, and the background grid/dots. SVG provides crisp rendering at any
zoom level, CSS styling, native DOM events, and accessibility.

### Layer 2: HTML divs (absolutely positioned, overlaid on SVG)

Renders node content. Each node is a `<div>` positioned via CSS `transform:
translate(x, y) scale(zoom)`. The div contains the node's rich-text content.

### Rich Text Rendering (Performance-Critical)

At any given time, at most ONE TipTap editor instance is mounted — the node
being actively edited. All other nodes render their `content` (TipTap JSON) as
static HTML via `generateHTML()` from `@tiptap/core`.

This means 500 nodes = 500 cheap static HTML renders + 0 or 1 TipTap instances
at any moment. This is the standard pattern used by production node-based
editors.

Activation: double-click a node (or press Space/F2) → mount TipTap in that
node's div. Deactivation: press Escape or click away → unmount TipTap, node
returns to static HTML.

## Views

### Canvas View

The primary spatial view. Features:

- Pan (drag background).
- Zoom (wheel, Cmd/Ctrl+Plus/Minus, Cmd/Ctrl+0 for fit-to-screen).
- Node selection (click).
- Node drag (reposition, sets explicit coordinates).
- Inline rich-text editing (double-click / Space / F2).
- Keyboard navigation between nodes.
- Edge rendering (Bezier or straight lines between parent and child).
- Background grid/dots.
- Collapse/expand subtrees.

### Outline View

A hierarchical indented list — like a table of contents. Shows the same
document tree as the canvas, ignoring spatial coordinates. Features:

- Collapsible/expandable branches (respects `collapsed` flag).
- Each item shows a text excerpt of node content (first line of rich text as
  plain text).
- Click an item → focus that node in the canvas (pan/zoom to center it).
- Drag-and-drop within outline to reparent nodes.
- Two-way sync: changes in canvas immediately reflect in outline and vice
  versa.

Both views subscribe to `MindmapEditor` state. Neither view owns the data;
both are projections of the immutable document.

## Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Create child node of current, enter edit mode |
| Shift+Tab | Promote node (move to parent's sibling level) |
| Enter | Create sibling node, enter edit mode |
| ArrowUp / ArrowDown | Navigate between siblings |
| ArrowLeft | Navigate to parent |
| ArrowRight | Navigate to first child |
| Delete / Backspace | Delete node (with subtree). If node has children, confirm first. |
| Space / F2 | Enter edit mode for current node |
| Escape | Exit edit mode / deselect |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Cmd/Ctrl+Plus / Minus | Zoom in / out |
| Cmd/Ctrl+0 | Fit to screen |

## Layout

### Free-Float (default)

Nodes keep their explicit `position` coordinates. Auto-layout does not touch
nodes that have non-null positions. Newly created nodes without explicit
position are placed near their parent.

### Auto-Layout Modes

When the user selects an auto-layout mode (tree-horizontal, tree-vertical,
radial), the library calls `computeLayout(doc, mode)` which uses d3-hierarchy
to calculate positions for all nodes with `position: null`:

- tree-horizontal: root on left, children branch right (tidy tree).
- tree-vertical: root on top, children branch down.
- radial: root in center, children radiate outward.

Nodes with explicit positions (set by user drag) are not overridden by
auto-layout. Auto-layout fills only null positions.

## Monorepo Structure

```
mindmaplib/
  packages/
    core/                 ← @mindmaplib/core — framework-agnostic engine
      src/
        types.ts          ← MindmapDoc, MindmapNode, interfaces
        document.ts       ← createDoc, tree operations, queries
        transactions.ts   ← Transaction interface, built-in transactions
        editor.ts         ← MindmapEditor class (undo/redo, subscribe)
        layout.ts         ← computeLayout (delegates to d3-hierarchy)
        store.ts          ← MindmapStore interface, InMemoryStore
        serialize.ts      ← serialize / deserialize
        index.ts          ← public exports
      tests/
      package.json
      tsconfig.json
    react/                ← @mindmaplib/react — React adapter
      src/
        Mindmap.tsx       ← main component (canvas viewport container)
        CanvasView.tsx    ← SVG + HTML divs rendering
        OutlineView.tsx   ← outline panel
        NodeView.tsx      ← single node (static HTML + TipTap on edit)
        EdgeView.tsx      ← connection line (SVG path)
        hooks/
          useEditor.ts    ← React binding to MindmapEditor
          useKeyboard.ts  ← keyboard navigation handler
        index.ts          ← public exports
      tests/
      package.json
      tsconfig.json
  demo/                   ← playground (Vite, NOT published to npm)
      src/
        App.tsx
        main.tsx
      index.html
      package.json
  docs/
    specs/                ← specifications (this file lives here)
    runbooks/             ← development process
    planning/
    audit/                ← evidence packets
  .github/
    workflows/
      ci.yml              ← PR: format, lint, typecheck, test, coverage, boundaries
      release.yml         ← npm publish on changeset merge
    CODEOWNERS
  .changeset/
    config.json
  package.json            ← root workspace config
  pnpm-workspace.yaml
  tsconfig.base.json
  LICENSE
  README.md
  AGENTS.md
  CLAUDE.md
```

### Package Boundary Rules (CI-enforced via dependency-cruiser)

- `@mindmaplib/core` MUST NOT import from `@mindmaplib/react` or `demo/`.
- `@mindmaplib/core` MUST NOT import React or any DOM-specific library.
- `@mindmaplib/react` MAY import from `@mindmaplib/core`.
- `demo/` MAY import from both packages.
- If `demo/` needs something from `core` that is not exported via the public
  API, the public API has a gap — fix the API, do not reach into internals.

## Implementation Outline

### Phase 1: Core Foundation

1. Project scaffolding: pnpm workspace, tsconfig.base, root package.json,
   pnpm-workspace.yaml.
2. `@mindmaplib/core` package: types, createDoc, tree operations, queries,
   serialize/deserialize.
3. Vitest setup, initial unit tests for all tree operations.
4. MindmapEditor class with undo/redo.
5. InMemoryStore implementation.
6. Layout engine integration (d3-hierarchy).

### Phase 2: React Adapter

1. `@mindmaplib/react` package scaffolding.
2. useEditor hook (React binding to MindmapEditor state).
3. CanvasView: SVG edges + HTML node divs, pan/zoom.
4. NodeView: static HTML rendering + TipTap mount on edit.
5. useKeyboard hook: full keyboard navigation.
6. EdgeView: connection rendering.

### Phase 3: Outline + Polish

1. OutlineView: hierarchical list, collapse/expand.
2. Two-way sync between canvas and outline.
3. Drag-and-drop in outline for reparenting.
4. Auto-layout mode switching.
5. Demo app with realistic data.

## Test Plan

### Unit Tests (core)

- createDoc: produces valid doc with root node.
- addNode: adds child, increments version, preserves immutability.
- deleteNode: removes subtree, not just the node.
- moveNode: reparents, validates newParentId exists, prevents cycles.
- updateNodeContent: replaces content, increments version.
- setNodePosition: sets coordinates, marks node as manual.
- toggleNodeCollapsed: flips flag.
- getChildren / getDescendants / getPath / getAncestors: correct traversal.
- computeLayout: fills null positions for each layout mode, preserves
  explicit positions.
- serialize / deserialize: round-trip preserves document.
- MindmapEditor: undo/redo stack correctness, ring buffer overflow, subscribe
  notifies on change.
- InMemoryStore: CRUD operations.

### Unit Tests (react)

- useEditor: subscribes to editor, unsubscribes on unmount.
- useKeyboard: all key combinations produce correct transactions.
- NodeView: static HTML render matches TipTap content, edit mode mounts
  TipTap, escape unmounts.
- EdgeView: correct SVG path for parent-child positions.

### Integration Tests

- Canvas + outline two-way sync: add node in canvas → appears in outline.
  Drag in outline → canvas updates positions.
- Full keyboard flow: Tab to create tree, arrows to navigate, Enter for
  siblings, edit, undo.

### Boundary Tests

- dependency-cruiser confirms core has zero imports from react or demo.
- dependency-cruiser confirms core has zero imports of `react` package.

## Operational Impact

This is a library, not a deployed service. Operational considerations:

- npm publish is automated via changesets + GitHub Actions.
- No server, no database, no runtime infrastructure.
- Demo is deployed to Cloudflare Pages (git push → deploy).
- Consumer bundle size is a quality metric — track and keep minimal.

## Collaboration Readiness (Future)

The architecture is designed to make future collaboration straightforward
without implementing it now:

- Immutable document model: any state can be serialized and compared.
- Transactional mutations: every change is a discrete operation that can be
  transmitted or stored.
- Serializable state: document is plain JSON with no functions or internal
  pointers.

When collaboration is needed, the path is: integrate Yjs as a CRDT layer,
bind Yjs document state to MindmapDoc, add WebSocket transport. The core
engine should not need rewriting.

## Changelog

- 0.1.0+backlog.0001: Initial draft.
