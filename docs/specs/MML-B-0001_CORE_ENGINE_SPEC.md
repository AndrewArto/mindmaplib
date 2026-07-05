# mindmaplib Core Engine Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0001.
Spec-Version: 0.4.2+backlog.0001.
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
- Positioned as an embeddable rich-text mindmap and outline editor for
  SaaS products, not a generic graph toolkit.
- Full keyboard navigation (Tab, Enter, arrows, shortcuts).
- Free-float layout with optional auto-layout modes (tree horizontal, tree
  vertical, radial).
- Immutable document model with transactional mutations and in-memory
  undo/redo.
- Storage-agnostic: host owns persistence, library exports a Store interface
  with an in-memory default implementation.
- MIT license, zero proprietary runtime dependencies.
- pnpm monorepo: core + react + demo.
- CI-enforced package boundary (core cannot import react or demo).

## Non-Goals

- Real-time multi-user collaboration. Architecture leaves the door open
  (immutable model, serializable state, serializable transactions), but no
  CRDT, no WebSocket layer, no presence in this spec.
- Mobile/touch support. Desktop-first, possibly desktop-only.
- Import/export to external formats (Markdown, OPML, FreeMind). JSON-only.
- Orphan nodes. One tree, one root. Deleting a node deletes its subtree.
- Server-side rendering of maps.
- Built-in persistence backend beyond the in-memory default.

## Technology Stack

Verified 2026-07-05 against npm registry. All runtime dependencies are MIT or
MIT-compatible. Versions are minimum floors, not exact pins. The project will
track latest stable within each major.

| Layer | Package | Min Version | License | Rationale |
|-------|---------|-------------|---------|-----------|
| Language | TypeScript | 5.x+ (strict) | Apache-2.0 | Type safety, IDE support |
| Rich text | @tiptap/core, @tiptap/pm, @tiptap/starter-kit | ^3.0 | MIT | Headless, framework-agnostic, MIT core |
| Layout math | d3-hierarchy | ^3.1 | ISC | Pure layout algorithms, no DOM, MIT-compatible |
| Framework adapter | React | ^18.3 \|\| ^19 | MIT | First integration target is a React app |
| Monorepo | pnpm workspaces | ^9 | MIT | Strict dependency boundaries, fast |
| Versioning | @changesets/cli | ^2 | MIT | OSS monorepo standard, npm publish automation |
| Boundaries | dependency-cruiser | ^18 | MIT | CI-enforced package isolation |
| Testing | vitest | ^2 | MIT | Fast, ESM-native, monorepo-friendly |
| Library bundling | tsup | ^8 | MIT | Zero-config TS library builds |
| Demo bundling | vite | ^6 | MIT | Fast dev server, standard for React demos |
| HTML sanitizer | DOMPurify | ^3 | MPL-2.0/Apache-2.0 | Sanitize generateHTML output in react adapter |

### License Verification Notes

- TipTap v3 core (`@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`) is MIT.
  Current npm: 3.27.1. TipTap Pro extensions (collaboration cursor, etc.) are
  commercial and MUST NOT be used.
- `generateHTML` is exported from `@tiptap/core`. It requires an extension list
  to render. This is part of the MIT-licensed core, not a Pro feature.
- d3-hierarchy is ISC-licensed (current: 3.1.2). ISC is functionally equivalent
  to MIT (permissive, no copyleft). Compatible with an MIT project.
- dependency-cruiser and changesets are devDependencies (not shipped to
  consumers), but both are MIT regardless.
- DOMPurify is MPL-2.0/Apache-2.0 dual-licensed. It is a runtime dependency
  of `@mindmaplib/react` (the sanitizer), NOT of `@mindmaplib/core`. Core
  remains free of DOM dependencies. MPL-2.0 is GPL-compatible and permits
  commercial use; the Apache-2.0 option is permissive.
- React is declared as `peerDependencies: ">=18.3 || >=19"` in
  `@mindmaplib/react`. The library supports React 18.3+ and 19.x. The demo
  and dev environment use React 19.

## Document Model

The document is an immutable tree represented as a flat node map. Tree
structure emerges from `parentId` relationships plus explicit child ordering.
There is exactly one root node.

```typescript
interface MindmapDoc {
  id: string
  rootId: string
  nodes: Record<string, MindmapNode>
  version: number          // document revision, incremented on every transaction
  meta: {
    title: string
    created: string  // ISO 8601
    updated: string  // ISO 8601
  }
}

interface MindmapNode {
  id: string
  parentId: string | null  // null only for root
  position: { x: number; y: number } | null  // computed or explicit coordinates
  manualPosition: boolean  // true = user-set, auto-layout must not override
  content: NodeContent     // rich text (see Node Content section)
  collapsed: boolean       // collapsed in outline and canvas
  childOrder: string[]     // ordered list of child IDs; [] = leaf
}
```

### Design Decisions

Flat node map (not nested tree). Reasons:

- O(1) lookup by id.
- O(1) attach/detach (flip `parentId`).
- Trivial serialization (plain JSON, no cycles).
- No deep-clone complexity on immutable updates — replace one entry in the
  record, not a path through a nested structure.

Child ordering: each node carries `childOrder: string[]`, an explicit ordered
list of its children's IDs. This provides deterministic sibling order for
outline rendering, `getChildren`, keyboard sibling navigation, Enter sibling
insertion, and d3 layout. Operations that add/remove/move nodes MUST update
both `parentId` on the child and `childOrder` on the old and new parents.

Position vs manualPosition: `position` holds the current coordinates
(regardless of source). `manualPosition` is a boolean indicating whether the
position was set by user drag (true) or computed by auto-layout (false).
Auto-layout overwrites `position` only for nodes where `manualPosition` is
false. This separates persisted user intent from derived layout output.

`content` is the rich text payload. See Node Content section below.

`version` is a monotonically increasing document revision integer. Incremented
on every transaction. Used for optimistic concurrency by the host.

`schemaVersion` lives in the `SerializedDoc` wrapper (see Serialization
section), not in `MindmapDoc` itself. This keeps the in-memory document model
clean and avoids dual-source-of-truth for schema version. Current: 1. If the
document format changes in a future release, `schemaVersion` in the wrapper
increments and `deserialize` must handle migration or reject.

One root, no orphans. `parentId: null` is valid only for the root node.
Attempting to set `parentId: null` on a non-root node throws. Node deletion
removes the entire subtree.

### Node Content

```typescript
interface NodeContent {
  type: 'doc'
  content: NodeContentBlock[]
}

// Blocks that contain inline text directly
interface TextBlock {
  type: 'paragraph' | 'heading' | 'codeBlock'
  attrs?: Record<string, unknown>
  content?: NodeContentInline[]
}

// Blocks that contain nested list items
interface ListBlock {
  type: 'bulletList' | 'orderedList'
  content: ListItemBlock[]
}

interface ListItemBlock {
  type: 'listItem'
  content: Array<TextBlock | ListBlock>  // paragraphs + optional nested lists
}

type NodeContentBlock = TextBlock | ListBlock

interface NodeContentInline {
  type: 'text'
  text: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}
```

This is a subset of the ProseMirror/TipTap JSON document format. The library
defines its own TypeScript types for it (not importing TipTap types into core)
so that `@mindmaplib/core` remains framework-agnostic with zero TipTap
dependency. List nodes use the standard ProseMirror nesting: `bulletList`
and `orderedList` contain `listItem` children, each containing `paragraph`
blocks and optionally nested `ListBlock` children (sub-lists). This matches
TipTap v3's `listItem` content schema (`paragraph block*`).

The React adapter is responsible for:

1. Converting `NodeContent` to TipTap editor state when entering edit mode.
2. Converting TipTap editor state back to `NodeContent` when exiting edit mode.
3. Rendering `NodeContent` as static HTML via `generateHTML()` with a
   configurable extension list.

Allowed node types in PoC: paragraph, heading (levels 1-3), bulletList,
orderedList, codeBlock. Allowed mark types: bold, italic, code, link. This
is the default extension set; the React adapter may allow host configuration
of the extension list.

### Node Content Limits

- Maximum list nesting depth: 4 levels of `bulletList`/`orderedList`.
- Maximum text length per node: 10,000 characters (normalized).
- Allowed `attrs` per node type:
  - `heading`: `{ level: 1 | 2 | 3 }` only.
  - `codeBlock`: `{ language?: string }` only.
  - `link` mark: `{ href: string; target?: '_blank' }` only. `href` must use
    `http:`, `https:`, or `mailto:` scheme.
  - Other node/mark types: no arbitrary attrs.
- `normalizeContent(content: NodeContent): NodeContent` strips disallowed
  attrs, truncates text, and removes unknown node types. Called by
  `updateContent` transactions and `deserialize`.

### HTML Sanitization (React Adapter)

Content stored in documents is treated as semi-trusted. The React adapter
MUST sanitize generated HTML before DOM insertion using DOMPurify with an
allowlist:

- Allowed tags: `p, h1, h2, h3, ul, ol, li, pre, code, strong, em, a, br`.
- `a` tag: `href` attribute only, scheme restricted to `http:`, `https:`,
  `mailto:`. `target="_blank"` allowed. `rel="noopener noreferrer"` enforced.
- All other attributes stripped. `style`, `class`, `id`, event handlers
  (`onerror`, `onclick`, etc.), `javascript:` URLs, and `data:` URLs are
  forbidden.
- `generateHTML()` output is always passed through DOMPurify before DOM
  insertion. No raw HTML bypass is exposed.

### Empty Node

A newly created node has this content:

```json
{ "type": "doc", "content": [{ "type": "paragraph", "content": [] }] }
```

### Immutability

`MindmapDoc` is treated as immutable. Every mutation produces a new document
object (structural sharing: unchanged node references are preserved). Views
(canvas, outline) subscribe to document state and re-render on change.

### Document Invariants

The following invariants MUST hold for any valid `MindmapDoc`. They are
checked by `validateDoc(doc)` which runs:

- Always inside `deserialize` (rejects malformed input).
- In dev/test builds after every operation (assertion).
- Not in production hot paths (use dev-mode only).

```typescript
function validateDoc(doc: MindmapDoc): void  // throws MindmapError on violation
```

Invariants:

1. `rootId` exists in `nodes`.
2. `nodes[rootId].parentId` is `null`.
3. Only the root has `parentId === null`. All other nodes have a non-null
   `parentId` pointing to an existing node.
4. No cycles: following `parentId` from any node reaches root.
5. No orphan nodes: every node is reachable from root.
6. `childOrder` on each node contains exactly the IDs of its children
   (those whose `parentId === this.id`), with no duplicates and no foreign IDs.
7. No duplicate node IDs.
8. If `manualPosition === true`, then `position` MUST be non-null.
9. `position` (when non-null) must contain finite numbers.
10. `content` matches the `NodeContent` schema (see Node Content Limits).
11. `schemaVersion` is present on the `SerializedDoc` wrapper, not on `MindmapDoc`.

## Transactions

All mutations are described by serializable `TransactionOp` values (plain JSON
discriminated unions). A pure function `applyOp(doc, op)` produces a new doc.
This separation keeps operations transmissible (network, storage, audit) while
keeping a single source of truth for behavior.

```typescript
// Serializable operation: plain JSON, no functions
type TransactionOp =
  | { type: 'addNode'; parentId: string; nodeId: string; insertAfter?: string | null; content?: NodeContent }
  | { type: 'deleteNode'; nodeId: string }
  | { type: 'moveNode'; nodeId: string; newParentId: string; insertAfter?: string | null }
  | { type: 'updateContent'; nodeId: string; content: NodeContent }
  | { type: 'setPosition'; nodeId: string; position: { x: number; y: number } }           // user drag: sets manualPosition=true
  | { type: 'layoutPosition'; nodeId: string; position: { x: number; y: number } }         // auto-layout: keeps manualPosition=false
  | { type: 'resetManualPosition'; nodeId: string }
  | { type: 'toggleCollapsed'; nodeId: string }

// Pure function: applies an op to a doc, returns a new doc
function applyOp(doc: MindmapDoc, op: TransactionOp): MindmapDoc

// A transaction bundles one or more ops applied atomically.
// baseVersion enables optimistic concurrency; the editor may reject
// transactions whose baseVersion does not match the current doc.version.
interface Transaction {
  id: string                  // unique transaction ID (uuid or monotonic)
  baseVersion: number         // doc.version this transaction was built against
  ops: TransactionOp[]        // one or more ops applied in order
  timestamp: string           // ISO 8601
  actorId?: string            // reserved for future collaboration
}

function applyTransaction(doc: MindmapDoc, tx: Transaction): MindmapDoc
// Applies each op in order. If baseVersion !== doc.version and strict
// mode is on, throws VersionConflictError. Increments doc.version by 1
// per transaction (not per op).
```

Built-in operation factories (construct `TransactionOp` values):

```typescript
function createAddNodeOp(parentId: string, nodeId: string, opts?: { insertAfter?: string | null; content?: NodeContent }): TransactionOp
function createDeleteNodeOp(nodeId: string): TransactionOp
function createMoveNodeOp(nodeId: string, newParentId: string, insertAfter?: string | null): TransactionOp
function createUpdateContentOp(nodeId: string, content: NodeContent): TransactionOp
function createSetPositionOp(nodeId: string, position: { x: number; y: number }): TransactionOp
function createLayoutPositionOp(nodeId: string, position: { x: number; y: number }): TransactionOp
function createResetManualPositionOp(nodeId: string): TransactionOp
function createToggleCollapsedOp(nodeId: string): TransactionOp
```

Built-in transaction builders (construct full `Transaction` objects):

```typescript
function buildTransaction(doc: MindmapDoc, ops: TransactionOp | TransactionOp[], opts?: { actorId?: string }): Transaction
// Creates a Transaction with:
//   id: generated uuid
//   baseVersion: doc.version (captured at build time)
//   ops: flattened array
//   timestamp: current ISO 8601
//   actorId: from opts or undefined
```

Version conflict detection:

```typescript
class VersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
    readonly transactionId: string,
  )
}

// MindmapEditor.apply accepts an optional strict flag:
// editor.apply(tx, { strict: true })  // default: false in PoC
// When strict is true and tx.baseVersion !== doc.version, throws VersionConflictError.
// When strict is false (default), the transaction is applied regardless of baseVersion.
// Strict mode is intended for collaboration and multi-tab sync scenarios.
```

The undo stack stores prior `MindmapDoc` snapshots (not inverse transactions).
Ring buffer, default 100 entries. Applying a transaction: push current doc
onto undo stack, clear redo stack, set new doc. Undo/redo are themselves
counted as new document revisions: each undo/redo increments `doc.version`,
so host sync (save with `expectedVersion`) works predictably.

Pure tree operations (convenience, internally create and apply transactions):

```typescript
function addNode(doc: MindmapDoc, parentId: string, opts?: { insertAfter?: string | null; content?: NodeContent }): MindmapDoc
function deleteNode(doc: MindmapDoc, nodeId: string): MindmapDoc
function moveNode(doc: MindmapDoc, nodeId: string, newParentId: string, insertAfter?: string | null): MindmapDoc
function updateNodeContent(doc: MindmapDoc, nodeId: string, content: NodeContent): MindmapDoc
function setNodePosition(doc: MindmapDoc, nodeId: string, position: { x: number; y: number }): MindmapDoc
function resetManualPosition(doc: MindmapDoc, nodeId: string): MindmapDoc
function toggleNodeCollapsed(doc: MindmapDoc, nodeId: string): MindmapDoc
```

The undo stack stores prior `MindmapDoc` states (not transaction inverses).
Ring buffer, default 100 entries. Applying a transaction: push current doc
onto undo stack, clear redo stack, set new doc. Undo: push current to redo,
pop undo. Redo: push current to undo, pop redo.

### Validation and Error Behavior

All tree operations validate inputs and throw `MindmapError` on invalid state:

- `addNode`: parentId must exist. Throws if not found.
- `deleteNode`: nodeId must exist. Throws if nodeId === rootId (root is
  immutable, cannot be deleted).
- `moveNode`: nodeId and newParentId must exist. Throws if nodeId === rootId
  (root cannot be reparented). Throws if newParentId is a descendant of nodeId
  (prevents cycles).
- `updateNodeContent`: nodeId must exist. Content must match NodeContent shape.
  Throws on malformed content.
- `setNodePosition`: nodeId must exist. Coordinates must be finite numbers.
- `resetManualPosition`: nodeId must exist. Sets manualPosition=false, position=null.
- `toggleNodeCollapsed`: nodeId must exist.

`deserialize` validates the JSON structure. Throws `MindmapError` on: missing
required fields, unknown schemaVersion (after migration window closes),
circular parent references, or root node missing. Does not throw on extra
unknown fields (forward-compatible) — unknown fields are stripped.

```typescript
class MindmapError extends Error {
  constructor(
    message: string,
    readonly code: 'NODE_NOT_FOUND' | 'ROOT_IMMUTABLE' | 'CYCLE_DETECTED' |
                   'INVALID_CONTENT' | 'INVALID_POSITION' | 'SCHEMA_MISMATCH' |
                   'MALFORMED_JSON',
    readonly nodeId?: string,
  )
}
```

## Public API Surface (core)

```typescript
// @mindmaplib/core

// --- Document ---
function createDoc(title: string): MindmapDoc

// --- Operation factories (construct TransactionOp values) ---
function createAddNodeOp(parentId: string, nodeId: string, opts?: { insertAfter?: string | null; content?: NodeContent }): TransactionOp
function createDeleteNodeOp(nodeId: string): TransactionOp
function createMoveNodeOp(nodeId: string, newParentId: string, insertAfter?: string | null): TransactionOp
function createUpdateContentOp(nodeId: string, content: NodeContent): TransactionOp
function createSetPositionOp(nodeId: string, position: { x: number; y: number }): TransactionOp
function createLayoutPositionOp(nodeId: string, position: { x: number; y: number }): TransactionOp
function createResetManualPositionOp(nodeId: string): TransactionOp
function createToggleCollapsedOp(nodeId: string): TransactionOp
function createLayoutPositionOp(nodeId: string, position: { x: number; y: number }): TransactionOp

// --- Transaction builder (construct full Transaction with baseVersion) ---
function buildTransaction(doc: MindmapDoc, ops: TransactionOp | TransactionOp[], opts?: { actorId?: string }): Transaction

// --- Pure tree operations (convenience wrappers) ---
function addNode(doc: MindmapDoc, parentId: string, opts?: { insertAfter?: string | null; content?: NodeContent }): MindmapDoc
function deleteNode(doc: MindmapDoc, nodeId: string): MindmapDoc
function moveNode(doc: MindmapDoc, nodeId: string, newParentId: string, insertAfter?: string | null): MindmapDoc
function updateNodeContent(doc: MindmapDoc, nodeId: string, content: NodeContent): MindmapDoc
function setNodePosition(doc: MindmapDoc, nodeId: string, position: { x: number; y: number }): MindmapDoc
function resetManualPosition(doc: MindmapDoc, nodeId: string): MindmapDoc
function toggleNodeCollapsed(doc: MindmapDoc, nodeId: string): MindmapDoc

// --- Queries (pure, read-only) ---
function getNode(doc: MindmapDoc, nodeId: string): MindmapNode | undefined
function getChildren(doc: MindmapDoc, nodeId: string): MindmapNode[]  // ordered per childOrder
function getDescendants(doc: MindmapDoc, nodeId: string): MindmapNode[]
function getPath(doc: MindmapDoc, nodeId: string): MindmapNode[]  // root → node
function getAncestors(doc: MindmapDoc, nodeId: string): MindmapNode[]

// --- Layout ---
type LayoutMode = 'free-float' | 'tree-horizontal' | 'tree-vertical' | 'radial'

interface NodeMeasure { width: number; height: number }
type NodeMeasures = Record<string, NodeMeasure>  // nodeId -> measured size

interface LayoutOptions {
  nodeMeasures?: NodeMeasures           // measured DOM sizes per node
  defaultNodeSize?: NodeMeasure         // fallback when measure absent (default: 120x40)
  spacingX?: number                     // horizontal gap (default: 40)
  spacingY?: number                     // vertical gap (default: 20)
}

function computeLayout(doc: MindmapDoc, mode: LayoutMode, options?: LayoutOptions): MindmapDoc
// Pure function: returns a new doc with recomputed positions.
// Does NOT mutate the input doc. The caller (MindmapEditor) wraps the
// result into a transaction internally:
//   1. Call computeLayout(oldDoc, mode, opts) -> newDoc
//   2. Extract position changes as layoutPosition ops
//      for each affected node (manualPosition === false nodes only)
//   3. Build a Transaction with those ops
//   4. Apply via applyTransaction -> new doc with incremented version
// This ensures layout changes go through the transaction layer and
// increment doc.version for host sync.
// Builds a transient d3-hierarchy tree using node measures (or defaults).
// Overwrites position for nodes where manualPosition === false.
// Preserves position for nodes where manualPosition === true.
// Children of a manual-positioned node are laid out relative to that node
// (manual node acts as a fixed anchor for its auto-positioned subtree).
// Collapsed nodes are treated as leaves: their descendants are not
// positioned (their positions are preserved but not recomputed).

// --- Serialization ---
function serialize(doc: MindmapDoc): string  // JSON string with schemaVersion
function deserialize(json: string): MindmapDoc  // validates, migrates if needed

// --- Editor state ---
interface EditorState {
  doc: MindmapDoc
  selectedNodeId: string | null     // currently selected node in canvas
  editingNodeId: string | null      // node with active TipTap editor
  viewport: { x: number; y: number; zoom: number }  // pan/zoom transform
  layoutMode: LayoutMode
}

// --- Editor (stateful, holds doc + UI state + undo/redo) ---
class MindmapEditor {
  constructor(initialDoc: MindmapDoc, options?: { store?: MindmapStore; undoLimit?: number })

  // Document access
  getDoc(): MindmapDoc
  getState(): EditorState

  // Mutations
  apply(tx: Transaction, opts?: { strict?: boolean }): void  // strict: throw on baseVersion mismatch
  addChild(parentId: string, opts?: { insertAfter?: string | null; content?: NodeContent }): string  // returns new node ID
  addSibling(siblingId: string, content?: NodeContent): string  // returns new node ID
  deleteNode(nodeId: string): void
  moveNode(nodeId: string, newParentId: string, insertAfter?: string | null): void
  promoteNode(nodeId: string): void  // move to parent's sibling level
  updateContent(nodeId: string, content: NodeContent): void
  setPosition(nodeId: string, position: { x: number; y: number }): void
  resetManualPosition(nodeId: string): void  // return node to auto-layout
  toggleCollapsed(nodeId: string): void

  // Selection and editing
  select(nodeId: string | null): void
  startEditing(nodeId: string): void
  stopEditing(): void

  // Viewport
  setViewport(viewport: { x: number; y: number; zoom: number }): void
  fitToScreen(): void  // computes viewport to fit all nodes

  // Layout
  setLayout(mode: LayoutMode): void  // runs computeLayout, wraps result in transaction

  // Undo/redo
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean

  // Store integration
  save(): Promise<void>      // calls store.save if store is configured
  load(docId: string): Promise<void>  // calls store.load, replaces doc
  isDirty(): boolean         // true if doc changed since last save/load

  // Subscription
  subscribe(listener: (state: EditorState) => void): () => void  // returns unsubscribe

  destroy(): void
}

// --- Store interface (host-implemented) ---
interface MindmapStore {
  load(docId: string): Promise<MindmapDoc | null>
  save(doc: MindmapDoc, options?: { expectedVersion?: number }): Promise<SaveResult>
  list(): Promise<MindmapDocMeta[]>
  delete(docId: string): Promise<void>
}

interface SaveResult {
  saved: boolean
  conflict: boolean        // true if expectedVersion mismatch
  currentVersion?: number  // server-side version after save (if saved)
}

interface MindmapDocMeta {
  id: string
  title: string
  updated: string
  version: number
}

// Typed store errors
class StoreError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'PERMISSION_DENIED' |
                   'QUOTA_EXCEEDED' | 'CORRUPT_DOCUMENT',
  )
}

// In-memory default implementation for dev/testing
class InMemoryStore implements MindmapStore { ... }
```

### Editor vs Pure Functions

The API has two layers:

1. Pure functions (`addNode`, `deleteNode`, etc.) take a doc and return a new
   doc. No side effects, no state. Useful for testing, custom pipelines, and
   functional-style code.

2. `MindmapEditor` is the stateful controller. It holds the current doc, UI
   state (selection, editing, viewport), undo/redo stacks, and optional store
   connection. The React adapter binds to `MindmapEditor` exclusively.

`MindmapEditor` convenience methods (`addChild`, `addSibling`, `promoteNode`)
create and apply transactions internally, so the React adapter does not need to
construct transaction objects for common operations.

## Serialization

```typescript
interface SerializedDoc {
  schemaVersion: number  // currently 1
  doc: MindmapDoc        // the full document
}
```

`serialize(doc)` returns `JSON.stringify({ schemaVersion: 1, doc })`.

`deserialize(json)` parses, checks `schemaVersion`, and returns the doc. If
`schemaVersion` is unknown (higher than supported), throws `MindmapError` with
code `SCHEMA_MISMATCH`. Future versions may implement migration functions:
`migrate_1_to_2(doc)` etc. The library will support N-1 backward compatibility
(can read docs from the previous schema version).

## Rendering Architecture

Two synchronized layers inside the canvas viewport. Both layers share one
coordinate space (document coordinates). A single viewport transform converts
document coordinates to screen coordinates.

### Coordinate System

All node positions and edge endpoints are in document coordinates (the same
coordinate space used by `node.position`). The viewport transform converts
document coordinates to screen pixels:

```
screenX = docX * viewport.zoom + viewport.x
screenY = docY * viewport.zoom + viewport.y
```

`viewport.x` and `viewport.y` are pan offsets in **screen pixels** (not
document units). `viewport.zoom` is the scale factor.

Both SVG and HTML layers are inside a single container element. The container
applies one CSS transform with `transform-origin: 0 0`:

```css
transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom});
transform-origin: 0 0;
```

CSS transforms apply right-to-left: scale first (in document space), then
translate (in screen pixels). This produces `screenX = docX * zoom + panX`,
matching the formula above. All children (SVG paths, HTML divs) use document
coordinates directly inside the transformed container. This avoids
double-scaling — only one transform is applied, at the container level.

### Layer 1: SVG

Renders edges (connection lines between parent and child nodes), selection
highlights, and the background grid/dots. SVG provides crisp rendering at any
zoom level, CSS styling, native DOM events, and accessibility.

### Layer 2: HTML divs

Renders node content. Each node is a `<div>` positioned at its document
coordinates via CSS `left` and `top` (inside the transformed container, so no
per-node transform needed). The div contains the node's rich-text content.

### Rich Text Rendering (Performance-Critical)

At any given time, at most ONE TipTap editor instance is mounted — the node
being actively edited (identified by `EditorState.editingNodeId`). All other
nodes render their `content` as static HTML.

The React adapter converts `NodeContent` to static HTML via TipTap's
`generateHTML()` with a configured extension list (default: StarterKit with
paragraph, heading, bold, italic, code, link). The generated HTML is sanitized
before DOM insertion (strip script, event handlers, javascript: URLs).

500 nodes = 500 cheap static HTML renders + 0 or 1 TipTap instances at any
moment. This is the standard pattern used by production node-based editors.

Activation: double-click a node (or press Space/F2) → `editor.startEditing()`
mounts TipTap in that node's div. Deactivation: press Escape or click away →
`editor.stopEditing()` unmounts TipTap, node returns to static HTML.

## Views

### Canvas View

The primary spatial view. Features:

- Pan (drag background).
- Zoom (wheel, Cmd/Ctrl+Plus/Minus, Cmd/Ctrl+0 for fit-to-screen).
- Node selection (click).
- Node drag (reposition, calls `editor.setPosition`, sets manualPosition=true).
- Inline rich-text editing (double-click / Space / F2).
- Keyboard navigation between nodes.
- Edge rendering (Bezier or straight lines between parent and child).
- Background grid/dots.
- Collapse/expand subtrees.

### Outline View

A hierarchical indented list. Shows the same document tree as the canvas,
ordered by `childOrder`, ignoring spatial coordinates. Features:

- Collapsible/expandable branches (respects `collapsed` flag).
- Each item shows a text excerpt of node content (first text node as plain
  text).
- Click an item → focus that node in the canvas (`editor.select(nodeId)` +
  pan/zoom to center it).
- Drag-and-drop within outline to reparent nodes (calls `editor.moveNode`).
- Two-way sync: changes in canvas immediately reflect in outline and vice
  versa.

Both views subscribe to `MindmapEditor` state (`editor.subscribe`). Neither
view owns data; both are projections of `EditorState`.

## Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Create child node of selected, enter edit mode |
| Shift+Tab | Promote node (move to parent's sibling level) |
| Enter | Create sibling node after current, enter edit mode |
| ArrowUp / ArrowDown | Navigate between siblings (per childOrder) |
| ArrowLeft | Navigate to parent |
| ArrowRight | Navigate to first child |
| Delete / Backspace | Delete node (with subtree). If node has children, confirm first. |
| Space / F2 | Enter edit mode for selected node |
| Escape | Exit edit mode / deselect |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Cmd/Ctrl+Plus / Minus | Zoom in / out |
| Cmd/Ctrl+0 | Fit to screen |

When a TipTap editor is active (editingNodeId is set), keyboard shortcuts are
handled by TipTap. The mindmap keyboard handler is suspended during editing.
Escape exits edit mode first, then deselects on second press.

## Layout

### Collapsed Semantics

When a node is collapsed (`collapsed === true`):

- Canvas: the node's descendants are not rendered (data is preserved).
- Outline: the node's children are not shown (expandable indicator shown).
- Layout: the collapsed node is treated as a leaf. Its descendants' positions
  are preserved in the document but not recomputed by `computeLayout`. When
  the node is expanded again, descendants reappear at their stored positions
  (or get re-laid-out if auto-positioned).
- Keyboard: arrow navigation skips hidden descendants. ArrowRight on a
  collapsed node expands it first (or navigates to first child, depending on
  adapter configuration).

### Free-Float (default)

Nodes keep their positions. Auto-layout does not touch nodes where
`manualPosition === true`. Newly created nodes get `manualPosition: false` and
`position: null`. They are placed near their parent on creation (offset by a
default spacing).

### Auto-Layout Modes

When the user selects an auto-layout mode (tree-horizontal, tree-vertical,
radial), the library calls `computeLayout(doc, mode)` which uses d3-hierarchy
to calculate positions for all nodes where `manualPosition === false`:

- tree-horizontal: root on left, children branch right (tidy tree).
- tree-vertical: root on top, children branch down.
- radial: root in center, children radiate outward.

Nodes where `manualPosition === true` are not overridden. Auto-layout computes
positions for auto-positioned nodes only. Switching layout mode recomputes all
auto-positioned nodes, not just new ones.

## Monorepo Structure

```
mindmaplib/
  packages/
    core/                 ← @mindmaplib/core — framework-agnostic engine
      src/
        types.ts          ← MindmapDoc, MindmapNode, NodeContent, interfaces
        document.ts       ← createDoc, tree operations, queries
        transactions.ts   ← Transaction, TransactionOp, factories
        editor.ts         ← MindmapEditor, EditorState
        layout.ts         ← computeLayout (delegates to d3-hierarchy)
        store.ts          ← MindmapStore interface, InMemoryStore
        serialize.ts      ← serialize / deserialize, schemaVersion
        errors.ts         ← MindmapError, error codes
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
- `@mindmaplib/core` MUST NOT import React, TipTap, or any DOM-specific
  library.
- `@mindmaplib/react` MAY import from `@mindmaplib/core`.
- `demo/` MAY import from both packages.
- If `demo/` needs something from `core` that is not exported via the public
  API, the public API has a gap — fix the API, do not reach into internals.

## Implementation Outline

### Phase 1: Core Foundation

1. Project scaffolding: pnpm workspace, tsconfig.base, root package.json,
   pnpm-workspace.yaml.
2. `@mindmaplib/core` types: MindmapDoc, MindmapNode, NodeContent,
   TransactionOp, EditorState.
3. Document operations: createDoc, addNode, deleteNode, moveNode,
   updateNodeContent, setNodePosition, toggleNodeCollapsed. All maintain
   childOrder consistency.
4. Queries: getChildren (ordered), getDescendants, getPath, getAncestors.
5. Transaction factories and apply logic.
6. MindmapEditor class with EditorState, undo/redo, selection, viewport.
7. Validation and error handling (MindmapError).
8. InMemoryStore implementation.
9. Layout engine integration (d3-hierarchy).
10. serialize/deserialize with schemaVersion.

### Phase 2: React Adapter

1. `@mindmaplib/react` package scaffolding.
2. useEditor hook (React binding to MindmapEditor state).
3. CanvasView: container with viewport transform, SVG edges + HTML node divs.
4. NodeView: static HTML rendering (generateHTML + sanitize) + TipTap mount
   on edit.
5. useKeyboard hook: full keyboard navigation, suspended during edit mode.
6. EdgeView: connection rendering.

### Phase 3: Outline + Polish

1. OutlineView: hierarchical list (ordered by childOrder), collapse/expand.
2. Two-way sync between canvas and outline.
3. Drag-and-drop in outline for reparenting.
4. Auto-layout mode switching UI.
5. Demo app with realistic data.

## Test Plan

### Unit Tests (core)

- createDoc: produces valid doc with root node, empty content, childOrder=[].
- addNode: adds child, updates parent's childOrder, increments version,
  preserves immutability, respects insertAfter ordering.
- deleteNode: removes subtree (all descendants), cleans childOrder on parent,
  throws on root deletion.
- moveNode: reparents, updates childOrder on old and new parent, validates
  newParentId exists, prevents cycles (moving under descendant), throws on
  root move.
- updateNodeContent: replaces content, validates NodeContent shape, increments
  version.
- setNodePosition: sets coordinates, sets manualPosition=true, validates finite
  numbers.
- resetManualPosition: sets manualPosition=false, position=null.
- layoutPosition op: sets position, keeps manualPosition=false.
- toggleNodeCollapsed: flips flag.
- getChildren: returns nodes in childOrder order.
- getDescendants / getPath / getAncestors: correct traversal.
- computeLayout: fills positions for manualPosition=false nodes, preserves
  manualPosition=true positions, correct for each layout mode.
- serialize / deserialize: round-trip preserves document, schemaVersion
  included, malformed JSON throws, unknown schemaVersion throws, extra fields
  stripped.
- MindmapEditor: undo/redo stack correctness, ring buffer overflow, subscribe
  notifies on state change, selection/editing state tracking, viewport state,
  save/load/isDirty with InMemoryStore.
- Transaction factories: produce correct TransactionOp, apply produces correct
  doc.
- Error handling: all validation paths throw correct MindmapError codes.

### Unit Tests (react)

- useEditor: subscribes to editor, unsubscribes on unmount, re-renders on
  state change.
- useKeyboard: all key combinations produce correct editor method calls,
  handler suspended when editingNodeId is set.
- NodeView: static HTML render matches NodeContent, edit mode mounts TipTap,
  escape unmounts, generated HTML is sanitized (no script tags).
- EdgeView: correct SVG path for parent-child positions in document coordinate
  space.
- Viewport transform: single container transform, no double-scaling, pan/zoom
  updates correctly.

### Integration Tests

- Canvas + outline two-way sync: add node in canvas → appears in outline in
  correct childOrder position. Drag in outline → canvas updates parentId and
  positions.
- Full keyboard flow: Tab to create tree, arrows to navigate, Enter for
  siblings, edit, undo, redo.
- Layout mode switching: switch from free-float to tree-horizontal, verify
  auto-positioned nodes move, manual-positioned nodes stay.
- Store integration: save → load round-trip, isDirty tracking, version
  increment on save.

### Boundary Tests

- dependency-cruiser confirms core has zero imports from react, demo, or
  TipTap packages.
- dependency-cruiser confirms core has zero imports of `react`, `@tiptap/*`.

### Security Tests

- NodeContent with script-like markup → generateHTML + sanitize produces no
  executable script.
- Deserialize with malformed JSON → throws, does not produce partial state.
- Link marks with javascript: URLs → stripped or sanitized.

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
- Transactional mutations: `TransactionOp` is serializable (plain data), can be
  transmitted over network or stored in an operation log.
- Serializable state: document is plain JSON with no functions or internal
  pointers.

When collaboration is needed, the path is: integrate Yjs as a CRDT layer,
bind Yjs document state to MindmapDoc, transmit TransactionOps as CRDT
updates over WebSocket. The core engine should not need rewriting.

## Changelog

- 0.1.0+backlog.0001: Initial draft.
- 0.2.0+backlog.0001: Codex review round 1 — added childOrder, manualPosition,
  NodeContent type definition, EditorState, validation/error behavior,
  viewport coordinate system, security model, store semantics, schemaVersion,
  ergonomic editor methods, expanded test plan.
- 0.3.0+backlog.0001: Codex review round 2 — fixed NodeContent list nesting
  (TextBlock/ListBlock union), fixed viewport transform math (pan in screen
  px, transform-origin: 0 0), removed schemaVersion from MindmapDoc (single
  source of truth in SerializedDoc wrapper).
- 0.3.1+backlog.0001: Codex review round 2 confirmation — ListItemBlock content
  made recursive (Array<TextBlock | ListBlock>) to support nested sub-lists.
- 0.4.0+backlog.0001: Stevens architecture review — TransactionOp as
  serializable discriminated union (apply removed from Transaction), document
  invariants + validateDoc, computeLayout with nodeMeasures, DOMPurify
  sanitizer contract, Store API with expectedVersion + typed errors,
  position/manualPosition invariant + resetManualPosition, NodeContent limits
  (max depth, text length, allowed attrs), collapsed layout semantics,
  React peerDep >=18.3 || >=19, product positioning (rich-text mindmap +
  outline editor for SaaS).
- 0.4.1+backlog.0001: Codex review v0.4.0 — added buildTransaction factory,
  VersionConflictError + strict mode, resetManualPosition in all op lists,
  computeLayout transaction-wrapping semantics.
- 0.4.2+backlog.0001: Codex review v0.4.1 — replaced create*Tx with
  create*Op + buildTransaction in public API, added layoutPosition op
  (auto-layout without marking manual), resetManualPosition in all lists.
