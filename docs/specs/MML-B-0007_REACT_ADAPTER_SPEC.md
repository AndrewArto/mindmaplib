# mindmaplib React Adapter Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0007.
Spec-Version: 0.1.0+backlog.0007.
Backlog lane: backlog.
Depends-on: MML-B-0001, MML-B-0002, MML-B-0003, MML-B-0004, MML-B-0005.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the architecture, component tree, public API surface, rendering
pipeline, and integration contracts for `@mindmaplib/react` — the React adapter
for the mindmaplib core engine.

The core engine (`@mindmaplib/core`, MML-B-0001) is framework-agnostic and
DOM-free. It manages the document model, transactions, layout math, store
interface, and serialization. The React adapter's job is to make that engine
usable inside a React application with a drop-in component: canvas with
pan/zoom and rich-text nodes, a synchronized outline panel, and full keyboard
navigation.

This spec is the umbrella implementation document for the adapter. It
references the cross-cutting concern specs (focus modes, node measurement,
accessibility, event API) and defines how they come together in components.

## Goals

- Drop-in `<Mindmap>` component that renders canvas + outline from a
  `MindmapEditor` instance.
- Canvas view: SVG edge layer + HTML node layer inside a single viewport
  transform. Pan, zoom, node drag, inline rich-text editing.
- Outline view: hierarchical indented list, synced to the same document,
  collapse/expand, drag-and-drop reparenting.
- Rich text in nodes via TipTap v3 (MIT core). At most one active editor
  instance at a time. All other nodes render static HTML from `generateHTML()`.
- HTML sanitization via DOMPurify on every generated HTML string before DOM
  insertion.
- Full keyboard navigation per the keymap in MML-B-0001, suspended during
  text editing per MML-B-0002.
- Node measurement via ResizeObserver, feeding real DOM sizes to the core
  layout engine per MML-B-0003.
- Accessibility: ARIA roles, roving tabindex, screen-reader support per
  MML-B-0004.
- Public event/callback API: onChange, onSelectionChange, onSaveError,
  onVersionConflict per MML-B-0005.
- Configurable: host can customize the TipTap extension list, node renderer,
  layout mode, and styling.
- React 18.3+ and 19.x support (peer dependency).
- Zero `any` in production TypeScript. Strict mode throughout.
- Published to npm as `@mindmaplib/react`.

## Non-Goals

- Real-time collaboration (core architecture leaves the door open; adapter does
  not implement presence, cursors, or WebSocket transport).
- Mobile/touch support. Desktop-first, mouse + keyboard.
- Custom rich-text extensions beyond the default set (host can extend via the
  TipTap extension config, but the library ships a fixed default set).
- CSS-in-JS. Styling is plain CSS classes; the host overrides via CSS.
- Server-side rendering of the canvas. The adapter is client-side only.
- Vue/Svelte adapters (planned separately, out of scope).

## Technology Stack

Extends the stack from MML-B-0001 with adapter-specific runtime dependencies.
All verified against npm registry on 2026-07-05.

| Layer          | Package                                       | Min Version    | License            | Rationale                                       |
| -------------- | --------------------------------------------- | -------------- | ------------------ | ----------------------------------------------- |
| Framework      | react, react-dom                              | ^18.3 \|\| ^19 | MIT                | First integration target is a React app         |
| Rich text      | @tiptap/core, @tiptap/pm, @tiptap/starter-kit | ^3.0           | MIT                | Headless, framework-agnostic, MIT core          |
| React binding  | @tiptap/react                                 | ^3.0           | MIT                | EditorContent component for React integration   |
| Link mark      | @tiptap/extension-link                        | ^3.0           | MIT                | Link not in StarterKit; required for link marks |
| HTML sanitizer | dompurify                                     | ^3             | MPL-2.0/Apache-2.0 | Sanitize generateHTML output before DOM insert  |
| Layout math    | d3-hierarchy                                  | ^3.1           | ISC                | Already a core dependency; adapter passes sizes |

### License Notes

- TipTap v3 core packages are MIT. TipTap Pro extensions (collaboration cursor,
  etc.) are commercial and MUST NOT be used or listed as dependencies.
- `@tiptap/starter-kit` bundles the default extensions (paragraph, heading,
  bold, italic, code, lists) but does NOT include Link. The `link` mark is
  part of the NodeContent contract (MML-B-0001), so `@tiptap/extension-link`
  (MIT) is an explicit dependency. The default extension set passed to
  `generateHTML()` is `[..., Link]`.
- DOMPurify is MPL-2.0/Apache-2.0 dual-licensed. It is a runtime dependency of
  `@mindmaplib/react` only, not of core. Core remains DOM-free.
- React is declared as `peerDependencies: ">=18.3 || >=19"`. The demo and dev
  environment use React 19.

### Peer Dependencies

```json
{
  "peerDependencies": {
    "@mindmaplib/core": "workspace:*",
    "react": "^18.3.0 || ^19.0.0",
    "react-dom": "^18.3.0 || ^19.0.0"
  }
}
```

`@mindmaplib/core` is a peer dependency so the host always has a single
instance of the engine. The adapter never bundles core.

## Package Boundary Rules

CI-enforced via dependency-cruiser, extending the rules from MML-B-0001:

- `@mindmaplib/react` MAY import from `@mindmaplib/core`.
- `@mindmaplib/react` MUST NOT import from `demo/`.
- `@mindmaplib/react` MAY import `react`, `react-dom`, `@tiptap/*`,
  `dompurify`, `d3-hierarchy`, `@tiptap/react`.
- `@mindmaplib/react` MUST NOT import any DOM-specific library not listed above
  without spec amendment.
- If the adapter needs a core symbol that is not in the public API, the public
  API has a gap — fix core, do not reach into core internals.

## Public API Surface

```typescript
// @mindmaplib/react

// --- Main component ---
interface MindmapProps {
  editor: MindmapEditor // required: engine instance from core
  className?: string // container class for CSS customization
  layoutMode?: LayoutMode // initial layout mode (default: 'free-float')
  showOutline?: boolean // render outline panel (default: true)
  outlineWidth?: number // pixel width of outline panel (default: 280)
  tiptapExtensions?: Extensions // override default TipTap extension set
  customNodeRenderer?: CustomNodeRenderer
  onChange?: (doc: MindmapDoc, tx: Transaction) => void
  onSelectionChange?: (nodeId: string | null) => void
  onSaveError?: (error: Error) => void
  onVersionConflict?: () => void
  onReady?: (editor: MindmapEditor) => void
}

function Mindmap(props: MindmapProps): JSX.Element

// --- Hooks ---
// React binding to MindmapEditor state. Subscribes on mount, unsubscribes on
// unmount. Returns current EditorState. Re-renders the consumer on every state
// change.
function useEditor(editor: MindmapEditor): EditorState

// Keyboard navigation handler. Returns a set of keyboard event handlers to
// spread onto the canvas container. Suspended automatically when
// state.editingNodeId is set (TipTap handles keyboard during editing).
function useKeyboard(editor: MindmapEditor): KeyboardHandlers

// Node measurement via ResizeObserver. Observes rendered node DOM elements,
// reports measured sizes to the editor for layout computation. Debounced.
function useNodeMeasures(
  editor: MindmapEditor,
  containerRef: RefObject<HTMLElement>,
): void

// --- Custom rendering ---
interface CustomNodeRendererProps {
  node: MindmapNode
  editor: MindmapEditor
  isEditing: boolean
  html: string // pre-sanitized static HTML for this node
}

type CustomNodeRenderer = (props: CustomNodeRendererProps) => ReactNode

// --- Sanitization export ---
// Exposed so hosts can sanitize custom HTML before passing to the adapter.
function sanitizeMindmapHtml(html: string): string

// --- Keyboard handler type ---
interface KeyboardHandlers {
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
}
```

## Component Architecture

```
<Mindmap>                         Root component. Creates the editor binding,
  │                               renders canvas + outline side by side.
  ├── <CanvasView>                Viewport container with single CSS transform.
  │   ├── <svg>                   Edge layer. One path per parent-child link.
  │   │   ├── <EdgeView />        Bezier or straight path between two nodes.
  │   │   └── <BackgroundGrid />  Dotted/grid pattern (CSS or SVG).
  │   └── <div className="nodes-layer">
  │       └── <NodeView />        One per visible node. Static HTML or TipTap.
  │           ├── <StaticNode>    generateHTML + sanitize, dangerouslySetInnerHTML.
  │           └── <TipTapNode>    Active editor instance (at most one).
  │
  └── <OutlineView>               Hierarchical indented list panel.
      └── <OutlineItem>           Recursive, one per node. Respect childOrder.
          ├── <collapse-toggle>
          ├── <text-excerpt>       First text node as plain text.
          └── <children>           Recursive OutlineItem list.
```

### Data Flow

```
MindmapEditor (core)
    │
    │ editor.subscribe(listener)
    ▼
useEditor(editor)  →  EditorState
    │
    ├── CanvasView  reads  state.doc, state.viewport, state.selectedNodeId,
    │                      state.editingNodeId
    │
    └── OutlineView reads  state.doc (tree projection, ignores positions)
```

The editor is the single source of truth. Both views are pure projections of
`EditorState`. Neither view mutates the document directly — all mutations go
through editor methods (`editor.addChild`, `editor.moveNode`, etc.).

### Rendering Performance Strategy

The critical performance constraint: render 500+ nodes without lag.

1. **Static HTML for idle nodes.** At any moment, at most one TipTap editor
   instance is mounted (the node being edited). All other nodes render their
   `NodeContent` as pre-sanitized static HTML via `generateHTML()` +
   `dangerouslySetInnerHTML`. No React reconciliation inside idle node content.

2. **Viewport culling.** Only render nodes whose document coordinates fall
   within the visible viewport (plus a margin). Off-screen nodes are not
   rendered in the DOM at all. The culling threshold accounts for current
   zoom level and viewport bounds.

3. **Memoized node components.** `<NodeView>` is wrapped in `React.memo` with a
   custom comparator that checks `node` reference identity (structural sharing
   from immutable updates means unchanged nodes keep their reference),
   `isEditing` flag, and `isSelected` flag. Without `isSelected`, selection
   changes (which only update `selectedNodeId`, not node references) would not
   trigger re-render, leaving `mml-node--selected` stale. Unchanged nodes skip
   re-render entirely.

4. **Single transform on the container.** The nodes-layer and SVG layer are
   children of one container that applies the viewport CSS transform. Pan/zoom
   updates the container transform string — no per-node repositioning, no React
   re-render of individual nodes on pan/zoom.

5. **Debounced measurement.** `ResizeObserver` callbacks are debounced (50ms)
   before triggering layout recomputation. Rapid content edits do not cause
   layout thrash.

## Viewport and Coordinate System

Implements the coordinate system defined in MML-B-0001 § Rendering Architecture.

### Transform

The canvas container applies one CSS transform:

```css
.mindmap-canvas-viewport {
  transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom});
  transform-origin: 0 0;
}
```

Both the SVG edge layer and HTML node layer are children of this container.
All child elements use document coordinates directly.

```
screenX = docX * viewport.zoom + viewport.x
screenY = docY * viewport.zoom + viewport.y
```

`viewport.x` and `viewport.y` are pan offsets in screen pixels. `viewport.zoom`
is the scale factor.

### Pan

Drag on the canvas background (not on a node) pans the viewport. The handler
calls `editor.setViewport({ x, y, zoom })` with updated offsets calculated from
mouse delta. The editor notifies subscribers, triggering a re-render with the
new transform string.

### Zoom

Mouse wheel zooms toward the cursor position. Cmd/Ctrl+Plus/Minus zooms toward
center. Cmd/Ctrl+0 triggers the adapter's fit-to-screen computation (see fitToScreen section below — the adapter computes the viewport from actual container dimensions, not core's fixed defaults).

Zoom-to-cursor math:

```typescript
// Maintain the document point under the cursor invariant.
const docX = (mouseScreenX - viewport.x) / viewport.zoom
const docY = (mouseScreenY - viewport.y) / viewport.zoom
const newZoom = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM)
const newX = mouseScreenX - docX * newZoom
const newY = mouseScreenY - docY * newZoom
editor.setViewport({ x: newX, y: newY, zoom: newZoom })
```

Constants:

- `MIN_ZOOM = 0.1` (10%)
- `MAX_ZOOM = 4.0` (400%)
- `ZOOM_WHEEL_FACTOR = 0.001` (wheel delta to zoom factor)

### fitToScreen

The current core `editor.fitToScreen(): void` uses the editor's internally
stored container dimensions (set at construction or via a separate method).
To avoid coupling core to a specific container, the adapter computes the
fit-to-screen viewport itself:

1. Read the container's pixel dimensions (`containerWidth`,
   `containerHeight`) from the DOM ref.
2. Query all positioned nodes from `editor.getDoc()` to find bounding box.
   For each positioned node, use its measured dimensions (from NodeMeasures)
   or the default size (120x40) to compute the full extent:
   `minX = min(position.x)`, `maxX = max(position.x + nodeWidth)`,
   `minY = min(position.y)`, `maxY = max(position.y + nodeHeight)`.
   Using anchor points alone would crop wide/tall node bodies.
3. Compute zoom: `min(containerW / (bboxW + padding), containerH / (bboxH +
padding), MAX_ZOOM)`.
4. Compute pan to center the bounding box: `x = (containerW - bboxW * zoom) /
2 - minX * zoom`, similarly for `y`.
5. Call `editor.setViewport({ x, y, zoom })`.

This keeps core free of DOM dependencies and container knowledge. The adapter
owns the fit-to-screen calculation because it owns the container ref.

## Canvas View

### SVG Edge Layer

Renders connection lines between parent and child nodes. Each edge is an SVG
`<path>` from the parent's edge anchor point to the child's edge anchor point.

Edge anchor points are computed from node positions and measures:

- tree-horizontal: parent right-center to child left-center
- tree-vertical: parent bottom-center to child top-center
- radial: parent outer edge to child inner edge (angle-based)
- free-float: parent right-center to child left-center (default)

Edge shape:

- Bezier curve for tree layouts (smooth horizontal/vertical S-curves).
- Straight line for radial and free-float.

Edge styling: the adapter applies a CSS class `mml-edge`. The host can override
stroke color, width, and style via CSS. Selected node edges get class
`mml-edge--selected`.

### HTML Node Layer

Each visible node is rendered as a `<div>` positioned at its document
coordinates via absolute positioning inside the transformed container:

```tsx
<div
  className={cn('mml-node', {
    'mml-node--selected': isSelected,
    'mml-node--editing': isEditing,
  })}
  data-node-id={node.id}
  style={{
    position: 'absolute',
    left: `${node.position?.x ?? 0}px`,
    top: `${node.position?.y ?? 0}px`,
  }}
>
  {children}
</div>
```

Node width is not set by the adapter — it is determined by content. The
`ResizeObserver` in `useNodeMeasures` reads the actual rendered size and
reports it to the editor for layout computation.

### Node Interaction

- **Click**: `editor.select(nodeId)`.
- **Double-click**: `editor.startEditing(nodeId)`.
- **Drag**: On mousedown on a node, start drag tracking. On mousemove, update a
  visual ghost (CSS transform, no document mutation). On mouseup, call
  `editor.setPosition(nodeId, { x, y })` which sets `manualPosition = true`.
  Escape during drag cancels (no mutation).
- **Collapse toggle**: Click on the collapse indicator (if node has children).

### Background Grid

A subtle dot grid or line grid rendered as an SVG pattern or CSS
`background-image` on the canvas container (behind the transform layer, so it
does not pan — or inside the transform layer, so it pans with the content;
adapter default: pans with content for spatial context).

Configurable via prop `showGrid?: boolean` (default: true) and `gridType?:
'dots' | 'lines' | 'none'` (default: 'dots').

## Node Rendering and Rich Text

### Static Node (Idle)

When a node is not being edited (`editingNodeId !== node.id`), it renders
static HTML:

```tsx
const html = useMemo(() => {
  const raw = generateHTML(node.content, tiptapExtensions)
  return sanitizeMindmapHtml(raw)
}, [node.content, tiptapExtensions])

return (
  <div
    className="mml-node-content"
    dangerouslySetInnerHTML={{ __html: html }}
  />
)
```

`generateHTML()` is from `@tiptap/core`. The extension list is configurable via
`MindmapProps.tiptapExtensions`, defaulting to `[..., Link]` (StarterKit plus the Link extension).

### Editing Node (Active)

When `editingNodeId === node.id`, the node mounts a TipTap `EditorContent`
component:

```tsx
<EditorContent editor={tiptapEditor} />
```

The TipTap editor instance is created on entering edit mode and destroyed on
exiting. Content is loaded from `node.content` on mount. On `stopEditing()`,
the adapter reads TipTap's JSON document state, converts it to `NodeContent`,
and calls `editor.updateContent(nodeId, content)`.

Lifecycle:

1. User double-clicks node (or presses Space/F2).
2. `editor.startEditing(nodeId)` sets `editingNodeId`.
3. `NodeView` detects `isEditing`, unmounts static HTML, mounts TipTap.
4. TipTap editor created with content from `node.content`.
5. User edits text. TipTap handles all keyboard input.
6. User presses Escape or clicks away.
7. Adapter reads TipTap JSON, converts to `NodeContent`, calls
   `editor.updateContent(nodeId, content)`.
8. `editor.stopEditing()` fires, clearing `editingNodeId`.
9. `NodeView` unmounts TipTap, mounts static HTML with updated content.
10. Keyboard navigation resumes.

IMPORTANT: content is read and persisted BEFORE `stopEditing()` clears
`editingNodeId`. If `stopEditing()` ran first, React would unmount the TipTap
editor before the adapter could read its JSON state, losing the user's edits.
The adapter must capture `tiptapEditor.getJSON()` and call
`editor.updateContent()` in the same synchronous handler, before the state
change that unmounts TipTap propagates through React.

### Sanitization

Every HTML string generated by `generateHTML()` passes through DOMPurify before
DOM insertion. The sanitizer config (from MML-B-0001):

```typescript
const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p',
    'h1',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'pre',
    'code',
    'strong',
    'em',
    'a',
    'br',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

function sanitizeMindmapHtml(html: string): string {
  const cleaned = DOMPurify.sanitize(html, SANITIZE_CONFIG)
  return enforceLinkRules(cleaned)
}

// DOMPurify ALLOWED_TAGS/ATTR alone does not enforce link-specific rules
// (target restriction, rel enforcement, scheme allowlist). This post-pass
// handles them using a DOMPurify hook or a manual DOM walk:
function enforceLinkRules(html: string): string {
  // Use DOMPurify's afterSanitizeAttributes hook to process <a> tags:
  // 1. If href scheme is not http/https/mailto, remove the href attribute.
  // 2. If target is set and not _blank, remove it (or set to _blank).
  // 3. If target=_blank, ensure rel="noopener noreferrer".
  // Implemented via DOMPurify.addHook('afterSanitizeAttributes', cb) at
  // module initialization, not per-call.
  return html
}

// Hook registration (run once at module load):
// DOMPurify.addHook('afterSanitizeAttributes', (node) => {
//   if (node.tagName === 'A') {
//     const href = node.getAttribute('href') || ''
//     if (!/^(https?:|mailto:)/i.test(href)) node.removeAttribute('href')
//     if (node.getAttribute('target') && node.getAttribute('target') !== '_blank') {
//       node.setAttribute('target', '_blank')
//     }
//     if (node.getAttribute('target') === '_blank') {
//       node.setAttribute('rel', 'noopener noreferrer')
//     }
//   }
// })
```

The sanitizer also enforces:

- `href` scheme restricted to `http:`, `https:`, `mailto:`.
- `target` only `_blank` permitted.
- `rel` set to `noopener noreferrer` when `target="_blank"`.
- `style`, `class`, `id`, event handlers, `javascript:` and `data:` URLs
  stripped.

No raw HTML bypass is exposed. The host's `customNodeRenderer` receives
pre-sanitized HTML — it must not inject unsanitized HTML.

### Custom Node Renderer

If `MindmapProps.customNodeRenderer` is provided, it replaces the default node
content rendering. The host receives `CustomNodeRendererProps`:

- `node`: the MindmapNode data.
- `editor`: the MindmapEditor instance for calling methods.
- `isEditing`: whether this node is the active editing target.
- `html`: pre-sanitized static HTML for the node's content.

The custom renderer can render anything: icons, badges, custom layouts,
external data. It is responsible for its own sanitization if it introduces HTML
beyond the provided `html` string. The adapter wraps the custom renderer output
in the same positioned `<div>` — the custom renderer controls content, not
positioning.

## Outline View

### Rendering

A hierarchical indented list that projects the same document tree as the
canvas, ordered by `childOrder`, ignoring spatial coordinates.

```tsx
function OutlineView({ editor }: { editor: MindmapEditor }) {
  const state = useEditor(editor)
  const root = state.doc.nodes[state.doc.rootId]
  return (
    <div className="mml-outline" role="tree">
      <OutlineItem node={root} editor={editor} level={0} />
    </div>
  )
}

function OutlineItem({ node, editor, level }: OutlineItemProps) {
  const state = useEditor(editor)
  const children = getChildren(state.doc, node.id)
  const isExpanded = !node.collapsed
  return (
    <div
      role="treeitem"
      aria-expanded={children.length > 0 ? isExpanded : undefined}
      aria-level={level + 1}
    >
      <div className="mml-outline-row">
        {children.length > 0 && (
          <button onClick={() => editor.toggleCollapsed(node.id)}>
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        <span onClick={() => editor.select(node.id)}>
          {textExcerpt(node.content)}
        </span>
      </div>
      {isExpanded &&
        children.map((child) => (
          <OutlineItem
            key={child.id}
            node={child}
            editor={editor}
            level={level + 1}
          />
        ))}
    </div>
  )
}
```

### Text Excerpt

Each outline row shows a plain-text excerpt of the node's content: the first
text node in the document, stripped of marks. Truncated to 80 characters with
ellipsis.

```typescript
function textExcerpt(content: NodeContent): string {
  // Walk content blocks, find first text inline, return its text.
  // Truncate to 80 chars + ellipsis if longer.
}
```

### Two-Way Sync

Both canvas and outline subscribe to the same `MindmapEditor` via
`useEditor`. When a mutation happens (add, delete, move, edit), the editor
notifies all subscribers. Both views re-render from the new `EditorState`.

Clicking an outline item calls `editor.select(nodeId)`, which updates
`selectedNodeId`. The canvas reacts to the selection change and can pan/zoom
to center the selected node (adapter default: highlight only, no auto-pan;
host can enable auto-pan via prop `selectToCenter?: boolean`).

### Drag-and-Drop Reparenting

The outline supports drag-and-drop to reparent nodes. The adapter uses the HTML
Drag and Drop API (no external DnD library):

1. `dragstart` on an outline item: store the dragged nodeId.
2. `dragover` on another item: prevent default to allow drop, show drop
   indicator (before, after as sibling, or inside as child).
3. `drop`: call `editor.moveNode(draggedId, targetParentId, insertAfter)`.

Root node is not draggable. Dropping a node onto its own descendant is rejected
(core throws `CYCLE_DETECTED`, adapter catches and shows no-op).

## Keyboard Navigation

Implements the keymap from MML-B-0001 § Keyboard Navigation, with focus
management from MML-B-0002.

### Handler Suspension

The `useKeyboard` hook returns a `KeyboardHandlers` object. The `onKeyDown`
handler checks `state.editingNodeId` first:

```typescript
function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  const state = editor.getState()
  // Suspended during text editing — TipTap handles keyboard.
  if (state.editingNodeId !== null) {
    // Only intercept Escape (to exit edit mode).
    if (e.key === 'Escape') {
      // IMPORTANT: persist TipTap content BEFORE clearing editingNodeId.
      // The handler calls a helper that reads tiptapEditor.getJSON(),
      // converts to NodeContent, calls editor.updateContent(), then
      // calls editor.stopEditing(). This prevents losing unsaved edits
      // when the editor unmounts.
      exitEditMode()
      e.preventDefault()
    }
    return
  }
  // Normal keyboard navigation.
  handleNavigationKey(e, editor)
}
```

### Keymap

| Key                   | Action                                                           |
| --------------------- | ---------------------------------------------------------------- |
| Tab                   | Create child node of selected, enter edit mode                   |
| Shift+Tab             | Promote node (move to parent's sibling level)                    |
| Enter                 | Create sibling node after current, enter edit mode               |
| ArrowUp / ArrowDown   | Navigate between siblings (per childOrder)                       |
| ArrowLeft             | Navigate to parent                                               |
| ArrowRight            | Navigate to first child (expand if collapsed)                    |
| Delete / Backspace    | Delete node (with subtree). If node has children, confirm first. |
| Space / F2            | Enter edit mode for selected node                                |
| Escape                | Exit edit mode / deselect                                        |
| Cmd/Ctrl+Z            | Undo                                                             |
| Cmd/Ctrl+Shift+Z      | Redo                                                             |
| Cmd/Ctrl+Plus / Minus | Zoom in / out                                                    |
| Cmd/Ctrl+0            | Fit to screen                                                    |

Delete with children: the adapter shows a `window.confirm()` dialog. If the
host provides a `confirmDelete?` callback prop, that replaces the native
confirm. This is a PoC approach; a proper modal is a future enhancement.

### Focus Scoping

Per MML-B-0002, keyboard shortcuts are scoped:

- Canvas has focus: canvas keymap active.
- Outline has focus: outline-specific keymap (ArrowUp/Down for sibling
  navigation, ArrowLeft/Right for collapse/expand, Enter to select + focus
  canvas). Tab/Enter node-creation shortcuts are canvas-only.
- Editing mode: all keyboard goes to TipTap.

Focus is tracked via `focusMode: 'none' | 'canvas' | 'outline' | 'editing'` in
`EditorState` (to be added to core types per MML-B-0002).

## Node Measurement Pipeline

Implements MML-B-0003. The adapter measures real DOM node sizes and passes
them to the core layout engine.

### useNodeMeasures Hook

```typescript
function useNodeMeasures(
  editor: MindmapEditor,
  containerRef: RefObject<HTMLElement>,
): void {
  // 1. On mount, create a ResizeObserver.
  // 2. Observe all rendered node DOM elements (identified by data-node-id).
  // 3. On resize, collect measures into a NodeMeasures record.
  // 4. Debounce 50ms, then call editor with updated measures.
  //    (Core stores measures and uses them on next computeLayoutOps call.)
  // 5. On unmount, disconnect observer.
}
```

The observer re-scans the DOM when the set of visible nodes changes (viewport
culling adds/removes nodes). Nodes that are culled (off-screen) are not
observed; their last known measure is retained by the editor.

Default node size (before first measurement): 120x40, matching the core
default in MML-B-0001.

### Layout Trigger

When the user switches layout mode, or when content changes invalidate
measurements, the adapter computes and applies the layout itself, because
core's `editor.setLayout(mode)` does not accept `nodeMeasures`:

1. Read current measures from the editor's stored NodeMeasures.
2. `computeLayoutOps(doc, mode, { nodeMeasures })` — core computes positions.
3. `buildTransaction(doc, ops)` — wrap into a transaction.
4. `editor.apply(tx)` — apply, increment version.
5. Update `EditorState.layoutMode` via a lightweight editor method or by
   including a mode-change in the state.

This requires either (a) a core API extension:
`editor.setLayout(mode, options?: { nodeMeasures?: NodeMeasures })`, or
(b) the adapter calls `computeLayoutOps` + `buildTransaction` + `editor.apply`
directly, then updates layoutMode through a setter. Option (a) is preferred and
should be added to MML-B-0001 before adapter implementation. The spec assumes
this core API will be extended.

## Styling Strategy

### No CSS-in-JS

The adapter ships plain CSS. All class names are prefixed with `mml-`
(mindmaplib). The host overrides styles by targeting these classes in their own
CSS.

### CSS Class Convention

| Class                 | Element                              |
| --------------------- | ------------------------------------ |
| `mml-container`       | Root container (canvas + outline)    |
| `mml-canvas`          | Canvas area                          |
| `mml-canvas-viewport` | Transformed viewport container       |
| `mml-nodes-layer`     | HTML node layer inside viewport      |
| `mml-node`            | Individual node wrapper              |
| `mml-node--selected`  | Selected node modifier               |
| `mml-node--editing`   | Editing node modifier                |
| `mml-node-content`    | Node content (static HTML or TipTap) |
| `mml-edge`            | SVG edge path                        |
| `mml-edge--selected`  | Edge connected to selected node      |
| `mml-background-grid` | Background grid                      |
| `mml-outline`         | Outline panel container              |
| `mml-outline-row`     | Single outline row                   |
| `mml-collapse-toggle` | Collapse/expand button               |

### Bundled CSS

The adapter exports a CSS file that the host imports:

```typescript
import '@mindmaplib/react/styles.css'
```

This file contains all default styles. The host can import it and override, or
skip it and write entirely custom CSS. The component tree works without the CSS
file (no inline styles for layout), but looks unstyled.

## Accessibility Contract

Implements MML-B-0004.

### Canvas

- Container: `role="application"`, `aria-label="Mindmap canvas"`.
- Each node: `aria-label` with text excerpt, `aria-selected` when selected.
- Keyboard focus: the canvas container has `tabindex={0}`. Focus is managed
  via roving tabindex on the selected node concept (the canvas itself holds
  focus; selection is visual + programmatic).

### Outline

- Container: `role="tree"`.
- Each item: `role="treeitem"`, `aria-expanded` (if has children),
  `aria-level` (depth + 1), `aria-selected`.
- Roving tabindex: only the focused outline item has `tabindex={0}`, others
  have `tabindex={-1}`. Arrow keys move focus between items.

### TipTap Editing

TipTap provides its own accessibility (contenteditable with ARIA). The adapter
does not interfere. When entering edit mode, focus moves to the TipTap editor.
When exiting, focus returns to the canvas container.

## Event and Callback API

Implements MML-B-0005.

The `MindmapProps` accepts optional callback functions:

- `onChange(doc, tx)`: fired after every transaction applied to the editor. The
  host can use this for auto-save, analytics, or logging.
- `onSelectionChange(nodeId)`: fired when `selectedNodeId` changes.
- `onSaveError(error)`: fired when `editor.save()` rejects (store error,
  network failure).
- `onVersionConflict()`: fired when `store.save()` returns
  `SaveResult.conflict === true`.
- `onReady(editor)`: fired once after initial mount, passing the editor
  instance. Useful for imperative access from parent components.

### Event Routing Contract

The current core `editor.subscribe(listener: (state: EditorState) => void)` only
emits `EditorState` — it does not include the `Transaction` that was applied,
nor does it emit on `save()`. The adapter cannot produce `onChange(doc, tx)`
or save callbacks from this subscription alone.

To resolve this, MML-B-0005 (Event API) must extend the core subscription
contract before adapter implementation. Two options:

1. **Core event enrichment (preferred).** Extend `editor.subscribe()` to pass
   an event object: `(event: EditorEvent) => void` where `EditorEvent` is a
   discriminated union:

   ```typescript
   type EditorEvent =
     | { type: 'transaction'; state: EditorState; tx: Transaction }
     | { type: 'selection'; state: EditorState; selectedNodeId: string | null }
     | { type: 'saveResult'; state: EditorState; result: SaveResult }
     | { type: 'saveError'; state: EditorState; error: Error }
   ```

   The adapter maps these to the callback props. `onChange` fires on
   `transaction`, `onSelectionChange` on `selection`,
   `onSaveError` on `saveError`, `onVersionConflict` when
   `saveResult.result.conflict === true`.

2. **Adapter interception (fallback).** If core changes are deferred, the
   adapter wraps the editor: it intercepts every mutation method
   (`apply`, `addChild`, `moveNode`, etc.) to capture the transaction,
   and wraps `save()` to capture results. This adds an indirection layer but
   avoids core API changes.

The preferred path is option 1, to be finalized in MML-B-0005. The adapter
spec assumes core will provide event metadata. If option 2 is chosen at
implementation time, the adapter's interception layer must be documented here.

Regardless of the chosen option, the adapter must NOT silently swallow events.
If a callback prop is undefined, the event is simply not dispatched to the
host — no error, no warning.

## Component Props Summary

```typescript
interface MindmapProps {
  // Engine
  editor: MindmapEditor

  // Layout
  layoutMode?: LayoutMode // default: 'free-float'
  selectToCenter?: boolean // default: false (outline click centers in canvas)

  // Outline
  showOutline?: boolean // default: true
  outlineWidth?: number // default: 280

  // Canvas
  showGrid?: boolean // default: true
  gridType?: 'dots' | 'lines' | 'none' // default: 'dots'

  // Rich text
  tiptapExtensions?: Extensions // default: [StarterKit, Link]
  customNodeRenderer?: CustomNodeRenderer

  // Interaction
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean // default: window.confirm

  // Callbacks
  onChange?: (doc: MindmapDoc, tx: Transaction) => void
  onSelectionChange?: (nodeId: string | null) => void
  onSaveError?: (error: Error) => void
  onVersionConflict?: () => void
  onReady?: (editor: MindmapEditor) => void

  // Styling
  className?: string
}
```

## Package Structure

```
packages/react/
  src/
    Mindmap.tsx           Main component: canvas + outline layout
    CanvasView.tsx        Viewport container, SVG + HTML layers
    NodeView.tsx          Single node (static HTML or TipTap)
    EdgeView.tsx          SVG edge path
    OutlineView.tsx       Outline panel
    OutlineItem.tsx       Recursive outline row
    BackgroundGrid.tsx    Grid/dots background
    hooks/
      useEditor.ts        React binding to MindmapEditor
      useKeyboard.ts      Keyboard navigation handler
      useNodeMeasures.ts  ResizeObserver measurement pipeline
    sanitize.ts           DOMPurify wrapper + config
    content.ts            textExcerpt, NodeContent <-> TipTap JSON conversion
    types.ts              Adapter-specific types (props, handlers)
    index.ts              Public exports
  styles/
    styles.css            Default styles (importable by host)
  tests/
    Mindmap.test.tsx
    CanvasView.test.tsx
    NodeView.test.tsx
    EdgeView.test.tsx
    OutlineView.test.tsx
    useEditor.test.tsx
    useKeyboard.test.tsx
    useNodeMeasures.test.tsx
    sanitize.test.ts
  package.json
  tsconfig.json
  tsup.config.ts
```

### Build Configuration

- **Bundler**: tsup (same as core). ESM output.
- **TypeScript**: strict mode, extends `tsconfig.base.json`.
- **Type declarations**: `.d.ts` files generated by tsup.
- **External dependencies**: React, React DOM, @mindmaplib/core, @tiptap/*,
  dompurify, d3-hierarchy are all `external` in the tsup config (not bundled).
- **CSS**: `styles.css` is copied as-is to the output directory, not processed
  by tsup.

### package.json

```json
{
  "name": "@mindmaplib/react",
  "version": "0.0.0",
  "description": "React adapter for mindmaplib — embeddable mindmap editor",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./styles.css": "./dist/styles.css"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "peerDependencies": {
    "@mindmaplib/core": "workspace:*",
    "react": "^18.3.0 || ^19.0.0",
    "react-dom": "^18.3.0 || ^19.0.0"
  },
  "dependencies": {
    "@tiptap/core": "^3.0",
    "@tiptap/extension-link": "^3.0",
    "@tiptap/pm": "^3.0",
    "@tiptap/react": "^3.0",
    "@tiptap/starter-kit": "^3.0",
    "dompurify": "^3",
    "d3-hierarchy": "^3.1"
  }
}
```

## Implementation Outline

### Phase 1: Package Scaffolding

1. Create `packages/react/` with package.json, tsconfig.json, tsup.config.ts.
2. Add `@mindmaplib/react` to pnpm-workspace.yaml (already present).
3. Update dependency-cruiser config to validate react package boundaries.
4. Install dependencies: @tiptap/core, @tiptap/pm, @tiptap/starter-kit,
   dompurify, d3-hierarchy, @types/dompurify, @types/d3-hierarchy.
5. Set up vitest with jsdom environment for DOM tests.
6. Create `src/index.ts` with empty exports, verify build.

### Phase 2: Core Hooks

1. `useEditor`: subscribe/unsubscribe pattern, state getter, re-render trigger.
2. `useKeyboard`: keymap dispatch, edit-mode suspension, focus scoping.
3. `useNodeMeasures`: ResizeObserver setup, debounce, measure reporting.

### Phase 3: Node Rendering

1. `sanitize.ts`: DOMPurify config, `sanitizeMindmapHtml()` export.
2. `content.ts`: `textExcerpt()`, NodeContent to TipTap JSON, TipTap JSON to
   NodeContent.
3. `NodeView`: static HTML rendering path (generateHTML + sanitize + memo).
4. `NodeView`: TipTap editing path (mount/unmount lifecycle, content sync).

### Phase 4: Canvas View

1. `CanvasView`: viewport container, CSS transform application.
2. Pan handler (background drag).
3. Zoom handler (wheel + keyboard, zoom-to-cursor).
4. `EdgeView`: SVG path computation per layout mode.
5. `BackgroundGrid`: dot/line grid rendering.
6. Viewport culling (only render visible nodes).

### Phase 5: Outline View

1. `OutlineView` + `OutlineItem`: recursive tree render, childOrder.
2. Collapse/expand, text excerpt.
3. Click-to-select (two-way sync with canvas).
4. Drag-and-drop reparenting.

### Phase 6: Integration and Polish

1. `Mindmap` component: compose canvas + outline, wire callbacks.
2. Custom node renderer support.
3. Confirm-delete dialog integration.
4. CSS styles file (`styles.css`).
5. Accessibility pass: ARIA roles, roving tabindex.
6. Full keyboard flow integration test.

## Test Plan

### Unit Tests

**Hooks:**

- `useEditor`: subscribes on mount, unsubscribes on unmount, re-renders
  consumer on state change, returns current EditorState.
- `useKeyboard`: each key combination produces correct editor method call
  (Tab to addChild, Enter to addSibling, etc.), handler suspended when
  editingNodeId is set, Escape exits edit mode during editing.
- `useNodeMeasures`: ResizeObserver fires on element resize, measures
  debounced, measures reported to editor, observer disconnected on unmount.

**NodeView:**

- Static HTML render matches NodeContent (paragraph, heading, list, code,
  marks).
- Generated HTML is sanitized: script tags stripped, event handlers removed,
  javascript: URLs removed, data: URLs removed.
- Edit mode: TipTap editor mounts with correct content, Escape unmounts and
  saves content, content update applied to editor.
- Custom node renderer receives correct props (node, editor, isEditing, html).
- React.memo prevents re-render when node reference unchanged.

**EdgeView:**

- Correct SVG path for parent-child positions in tree-horizontal layout.
- Correct path for tree-vertical layout.
- Correct path for radial layout.
- Correct path for free-float layout.
- Edge uses document coordinates (not screen coordinates).

**CanvasView:**

- Viewport transform applied as single CSS transform string.
- Pan updates viewport.x/y correctly.
- Zoom-to-cursor maintains cursor document point invariant.
- Zoom clamped to MIN_ZOOM/MAX_ZOOM.
- fitToScreen computes viewport that contains all positioned nodes.
- Viewport culling renders only visible nodes.

**OutlineView:**

- Renders tree in childOrder order.
- Collapse hides children, expand shows them.
- Text excerpt shows first text node, truncated to 80 chars.
- Click selects node (calls editor.select).
- Drag-and-drop calls editor.moveNode with correct arguments.
- Root not draggable.
- Drop on descendant rejected (no-op).

**Sanitize:**

- DOMPurify config strips all non-allowed tags.
- href scheme restricted to http/https/mailto.
- target restricted to _blank.
- rel enforced as noopener noreferrer when target=_blank.

### Integration Tests

- Canvas + outline two-way sync: add node in canvas, appears in outline in
  correct childOrder position. Drag in outline, canvas updates parentId.
- Full keyboard flow: Tab to create tree, arrows to navigate, Enter for
  siblings, edit with Space, undo/redo.
- Layout mode switching: switch from free-float to tree-horizontal, verify
  auto-positioned nodes move, manual-positioned nodes stay.
- Store integration: onChange fires on every mutation, onSaveError fires on
  store failure, onVersionConflict fires on version mismatch.
- Custom node renderer renders alongside default nodes.

### Security Tests

- NodeContent with `<script>` markup: static HTML has no executable script.
- Link marks with `javascript:` URLs: stripped by sanitizer.
- NodeContent with `<img onerror="...">`: event handler stripped.
- Custom node renderer: document host-responsibility boundary. The default
  renderer output is always sanitized. However, a custom renderer returning
  arbitrary ReactNode CAN use dangerouslySetInnerHTML on its own output. The
  adapter cannot prevent this — the host must sanitize any additional HTML.

### Boundary Tests

- dependency-cruiser confirms react package imports core, not demo.
- dependency-cruiser confirms react package imports only allowed DOM libraries.
- React package does not bundle core (core is a peer dependency).

### Accessibility Tests

- Outline: role="tree" on container, role="treeitem" on each item,
  aria-expanded on items with children, aria-level correct.
- Canvas: role="application" on container.
- Keyboard navigation works without mouse (Tab through the component, arrows
  for navigation, Space to edit).

## Operational Impact

The adapter is a library, not a deployed service.

- npm publish is automated via changesets + GitHub Actions (same pipeline as
  core).
- No server, no database. The adapter runs entirely in the browser.
- Consumer bundle size is a quality metric. The adapter should add minimal
  weight beyond its dependencies (TipTap, DOMPurify, d3-hierarchy).
- The demo app (`demo/`) serves as the integration testbed — it imports the
  adapter exactly as an external consumer would.

## Collaboration Readiness (Future)

The adapter does not implement real-time collaboration. When the core gains
collaboration support (Yjs CRDT layer), the adapter will need:

- Presence indicators (other users' cursors/selections) overlaid on the canvas.
- Awareness of remote edits updating TipTap content during active editing.
- These are future specs, not part of this document.

## Changelog

- 0.1.0+backlog.0007: Initial draft. Covers component architecture, public API
  surface, rendering pipeline, viewport, node rendering with TipTap, outline
  view, keyboard navigation, node measurement, styling, accessibility, event
  API, implementation outline, and test plan.
