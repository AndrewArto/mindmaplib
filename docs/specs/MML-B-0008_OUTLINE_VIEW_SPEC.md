# mindmaplib Outline View Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0008.
Spec-Version: 0.1.0+backlog.0008.
Backlog lane: backlog.
Depends-on: MML-B-0001, MML-B-0007.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the complete architecture, component tree, interaction model,
accessibility contract, and test plan for the outline view — the hierarchical
panel that projects the mindmap document tree as an indented list, synchronized
with the canvas view.

The outline view is a first-class view in mindmaplib. While MML-B-0007 (React
Adapter) defines the outline at a high level as part of the adapter, this spec
expands it into a full implementation contract: rendering strategy, keyboard
navigation, drag-and-drop reparenting, collapse/expand semantics, text
excerpts, search/filter, and the two-way sync protocol with the canvas.

## Goals

- Hierarchical indented list projection of `MindmapDoc`, ordered by
  `childOrder`, ignoring spatial coordinates.
- Two-way sync with canvas: mutations in either view reflect in both.
- Collapse/expand branches (respects `collapsed` flag on nodes).
- Drag-and-drop reparenting within the outline (HTML Drag and Drop API, no
  external library).
- Full keyboard navigation: arrows for tree traversal, Tab/Enter behavior
  scoped to outline focus.
- Click-to-select: clicking an outline item selects the node in the editor
  (canvas reflects selection).
- Optional click-to-center: host can enable auto-pan/zoom to the selected node
  in the canvas.
- Text excerpts: each row shows a plain-text summary of node content.
- Search/filter: optional inline search to highlight/filter matching nodes.
- Accessibility: ARIA tree role, treeitem semantics, roving tabindex, screen
  reader support.
- Performance: single editor subscription, prop-passed state, memoized items.
  Target: 500+ nodes without lag.

## Non-Goals

- Canvas rendering (covered by MML-B-0007 § Canvas View).
- Rich-text editing inside outline rows. Editing happens in the canvas; the
  outline is read-only for content (but supports structural operations: move,
  delete, collapse).
- Custom outline renderers in this spec (future enhancement). The outline uses
  a fixed rendering model; hosts can style via CSS.
- Mobile/touch drag-and-drop. Desktop mouse + keyboard.
- Multi-select in the outline. Single selection only (matching canvas).

## Relationship to MML-B-0007

MML-B-0007 defines the outline as a component within the React adapter. This
spec extends that definition with implementation-level detail. Where the two
specs conflict, this spec is authoritative for outline-specific behavior.
MML-B-0007 remains authoritative for the adapter-level integration (props,
callbacks, viewport).

## Component Architecture

```
<OutlineView>                    Single subscriber to MindmapEditor.
  │                              Holds EditorState, builds flat visible list.
  │
  ├── <OutlineToolbar>           Optional: search input, collapse-all button.
  │   └── <SearchInput>
  │
  └── <OutlineTree>              Scrollable container, role="tree".
      └── <OutlineItem>          Flat list of items (NOT recursive).
          ├── <CollapseToggle>   Shown if node has children.
          ├── <TextExcerpt>      First text node, plain text.
          └── <NodeBadges>       Optional: child count, position indicator.
```

Note: items are flat siblings, not nested. ARIA hierarchy is communicated
via `aria-level`, `aria-posinset`, `aria-setsize` attributes.

### Data Flow

```
MindmapEditor (core)
    │
    │ editor.subscribe(listener) — ONE subscription
    ▼
OutlineView → useEditor(editor) → EditorState
    │
    │ Builds flat visible list, passes node + depth as props
    ▼
OutlineItem (memoized, flat) — no subscription, pure props
```

The outline subscribes to the editor exactly ONCE at the `OutlineView` level.
Individual `OutlineItem` components receive `node`, `depth`, `isSelected`,
and `isEditing` as props (not `doc`). This is critical for performance: 500
items each subscribing independently would create 500 listeners, each firing
on every state change.

### Rendering Strategy — Flattened List (Not Recursive)

The outline MUST NOT use recursive component rendering (`OutlineItem`
rendering child `OutlineItem`s). Recursive rendering with `React.memo` on
`node` reference breaks when a descendant changes: structural sharing
preserves ancestor references, so a memoized ancestor skips re-render and
never propagates updated props to its children.

Instead, use a **flattened list** approach:

1. `OutlineView` calls `useEditor(editor)` — single subscription.
2. Compute a flat ordered list of visible items via depth-first traversal:

```typescript
function buildVisibleList(doc: MindmapDoc): string[] {
  const result: string[] = []
  function walk(nodeId: string) {
    result.push(nodeId)
    const node = getNode(doc, nodeId)
    if (!node || node.collapsed) return
    for (const childId of node.childOrder) walk(childId)
  }
  walk(doc.rootId)
  return result
}
```

3. Render the flat list as siblings (not nested):

```tsx
<div className="mml-outline-tree" role="tree">
  {visibleIds.map((id) => {
    const node = getNode(state.doc, id)!
    const depth = getPath(state.doc, id).length - 1
    return (
      <OutlineItem
        key={id}
        node={node}
        depth={depth}
        isSelected={id === state.selectedNodeId}
        isEditing={id === state.editingNodeId}
        editor={editor}
      />
    )
  })}
</div>
```

4. Each `OutlineItem` is a flat row — no children, no recursion. Wrapped
   in `React.memo` comparing `node` reference, `isSelected`, `isEditing`,
   `depth`, and `focusedId` (the roving-tabindex focus target). When a branch
   is moved or focus changes, rows need updated indentation/`aria-level`/
   `tabindex` even though the `node` object is unchanged (structural sharing).
   Without `depth` and `focusedId` in the comparator, those rows would be
   stale. Structural sharing ensures only changed nodes get new references.

5. Indentation is via `depth` prop, `padding-left` (not DOM nesting).

6. ARIA hierarchy is communicated via `aria-level`, `aria-posinset`, and
   `aria-setsize` attributes on each `treeitem` — no DOM nesting needed.

This solves both problems: single subscription (performance) and correct
propagation of descendant updates (each row is independent, rendered from
the flat list rebuilt on every state change).

### Text Excerpt

Each outline row displays a plain-text excerpt of the node's content.

```typescript
function textExcerpt(content: NodeContent, maxLength = 80): string {
  // Walk content blocks in order, find first text inline node.
  // Concatenate text from the first paragraph/heading until maxLength.
  // Strip marks (bold, italic, etc.) — plain text only.
  // If no text found, return '(empty)'.
  // Truncate to maxLength with ellipsis if longer.
}
```

Rules:

- First text node in document order (depth-first through blocks).
- Marks stripped: `{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }`
  yields `'Hello'`.
- List items: the first `listItem`'s first paragraph text is used.
- Code blocks: raw text content (no syntax highlighting in excerpt).
- Empty nodes (no text content): display `'(empty)'` in muted style
  (`mml-outline-excerpt--empty`).
- Maximum 80 characters, truncated with `…`.

### Node Badges

Each row can display optional badges to the right of the excerpt:

- **Child count**: if the node has children, show `N` in a small badge. Helps
  identify branch nodes when collapsed (children hidden).
- **Position indicator**: if `manualPosition === true`, show a pin icon
  indicating the node has a user-set position.
- **Dirty indicator**: if the node's content was edited since last save
  (comparing version to lastSavedVersion), optionally show a dot.

Badges are styled via CSS classes `mml-outline-badge`, `mml-outline-badge--N`.

## Collapse and Expand

### Toggle

Clicking the collapse toggle (▼/▶) calls `editor.toggleCollapsed(nodeId)`.

- Expanded node (`collapsed === false`): shows ▼, children rendered.
- Collapsed node (`collapsed === true`): shows ▶, children hidden.
- Leaf node (no children): no toggle shown.

### Collapse All / Expand All

The `OutlineToolbar` (if `showToolbar` prop is true) provides:

- **Collapse All**: collapses every non-leaf node. Only nodes where
  `collapsed === false` are toggled — idempotent. Single transaction.
- **Expand All**: expands every node. Only nodes where `collapsed === true`
  are toggled — idempotent. Single transaction.

```typescript
function collapseAll(editor: MindmapEditor): void {
  const doc = editor.getDoc()
  const ops = Object.values(doc.nodes)
    .filter((n) => !n.collapsed && n.childOrder.length > 0)
    .map((n) => createToggleCollapsedOp(n.id))
  if (ops.length > 0) editor.apply(buildTransaction(doc, ops))
}

function expandAll(editor: MindmapEditor): void {
  const doc = editor.getDoc()
  const ops = Object.values(doc.nodes)
    .filter((n) => n.collapsed)
    .map((n) => createToggleCollapsedOp(n.id))
  if (ops.length > 0) editor.apply(buildTransaction(doc, ops))
}
```

Filtering by current state ensures idempotency: Collapse All only toggles
expanded nodes, Expand All only toggles collapsed nodes.

These operations are undoable (they go through the transaction layer).

### Keyboard Collapse/Expand

- **ArrowRight** on a collapsed node: expand it (`toggleCollapsed`).
- **ArrowLeft** on an expanded node: collapse it (`toggleCollapsed`).
- **ArrowRight** on an expanded node: move focus to first child.
- **ArrowLeft** on a leaf or collapsed node: move focus to parent.

## Keyboard Navigation

The outline has its own keyboard handler, separate from the canvas keymap.
Focus management follows MML-B-0002 (focus scoping).

### Focus Model: Roving Tabindex

Only ONE outline item has `tabindex={0}` at a time — the focused item. All
others have `tabindex={-1}`. Arrow keys move focus between items without
tabbing out of the outline.

The focused item is tracked in `OutlineView` state:

```typescript
const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
```

When the user navigates with arrows, `focusedItemId` updates and DOM focus
moves to the new item via a ref.

### Keymap (Outline Focus)

| Key                | Action                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| ArrowUp            | Move focus to previous visible item (previous sibling or parent's last visible descendant) |
| ArrowDown          | Move focus to next visible item (next sibling or first child)                              |
| ArrowLeft          | Collapse expanded node; if already collapsed or leaf, move focus to parent                 |
| ArrowRight         | Expand collapsed node; if already expanded, move focus to first child                      |
| Home               | Move focus to root                                                                         |
| End                | Move focus to last visible item (depth-first)                                              |
| Enter              | Select node in canvas + transfer focus to canvas                                           |
| Space              | Select node in canvas (keep focus in outline)                                              |
| Delete / Backspace | Delete node (with confirm if has children). Root is immutable — no-op.                     |
| F2                 | Select node + enter edit mode in canvas (transfers focus)                                  |
| Escape             | Deselect (clears selection)                                                                |

Root deletion: core throws `ROOT_IMMUTABLE` when `deleteNode(rootId)` is
called. The outline keyboard handler MUST guard against this: if the focused
node is the root, Delete/Backspace is a no-op (no confirm dialog, no error).

Note: Tab/Shift+Tab (create child/sibling) are canvas-only shortcuts. In the
outline, Tab follows browser default (move to next focusable element outside
the outline).

### Search-Aware Navigation

When search is active (filter is applied), the navigation algorithms
(`getNextVisibleItem`, `getPrevVisibleItem`) MUST operate on the filtered
visible item list, not the raw tree. A "visible" item during search is one
that matches the query OR is an ancestor of a matching item. Collapsed nodes
that contain matches are treated as expanded for navigation purposes (the
filter overrides the `collapsed` flag for visibility). This prevents focusing
hidden rows or skipping rendered matches.

### Navigation Algorithm

```typescript
function getNextVisibleItem(doc: MindmapDoc, currentId: string): string | null {
  // 1. If current is expanded and has children: first child.
  const node = getNode(doc, currentId)!
  if (!node.collapsed && node.childOrder.length > 0) {
    return node.childOrder[0]
  }
  // 2. If has next sibling: next sibling.
  const nextSibling = getNextSibling(doc, currentId)
  if (nextSibling) return nextSibling
  // 3. Walk up: find nearest ancestor with a next sibling.
  let parentId = node.parentId
  while (parentId !== null) {
    const uncle = getNextSibling(doc, parentId)
    if (uncle) return uncle
    parentId = getNode(doc, parentId)!.parentId
  }
  return null // no next item (current is last in tree)
}

function getPrevVisibleItem(doc: MindmapDoc, currentId: string): string | null {
  // 1. If has prev sibling:
  const prevSibling = getPrevSibling(doc, currentId)
  if (prevSibling) {
    // Find last visible descendant of prev sibling.
    return getLastVisibleDescendant(doc, prevSibling)
  }
  // 2. Otherwise: parent.
  const node = getNode(doc, currentId)!
  return node.parentId
}
```

## Drag-and-Drop Reparenting

The outline supports drag-and-drop to reparent or reorder nodes using the HTML
Drag and Drop API (no external DnD library).

### Drag Source

- `draggable={true}` on each `OutlineRow` (except root).
- `onDragStart`: store the dragged `nodeId` in a ref or dataTransfer. Set a
  drag image (the row element).
- Root node is NOT draggable.

### Drop Target

Each `OutlineRow` is a drop target with three zones:

1. **Before** (top edge): drop as previous sibling of the target.
2. **After** (bottom edge): drop as next sibling of the target.
3. **Inside** (middle): drop as first child of the target.

```typescript
function getDropZone(
  e: React.DragEvent,
  rowElement: HTMLElement,
): 'before' | 'after' | 'inside' {
  const rect = rowElement.getBoundingClientRect()
  const y = e.clientY - rect.top
  const h = rect.height
  if (y < h * 0.25) return 'before'
  if (y > h * 0.75) return 'after'
  return 'inside'
}
```

- `onDragOver`: compute drop zone, show visual indicator (CSS class on the
  row: `mml-outline-drop--before`, `--after`, `--inside`). Call
  `e.preventDefault()` to allow drop.
- `onDragLeave`: clear drop indicator.

### Drop Action

- `onDrop`: compute final drop zone, call the appropriate editor method:

```typescript
function handleDrop(
  draggedId: string,
  targetId: string,
  zone: 'before' | 'after' | 'inside',
) {
  if (draggedId === targetId) return // no-op
  if (isDescendant(doc, targetId, draggedId)) return // reject: would create cycle

  if (zone === 'inside') {
    editor.moveNode(draggedId, targetId, null) // first child
  } else {
    const target = getNode(doc, targetId)!
    // Root has no parent — coerce sibling drop to 'inside'.
    if (target.parentId === null) {
      editor.moveNode(draggedId, targetId, null)
      return
    }
    const parentId = target.parentId
    const insertAfter =
      zone === 'before' ? getPrevSibling(doc, targetId) : targetId
    editor.moveNode(draggedId, parentId, insertAfter)
  }
}
```

### Cycle Prevention

Dropping a node onto its own descendant is rejected. The adapter checks
`isDescendant(doc, targetId, draggedId)` before calling `moveNode`. If the
check fails, the drop is a no-op with no visual feedback change (the indicator
was cleared on dragOver if the target was a descendant).

Root node is not a valid drop target for 'before' or 'after' (it has no
siblings). Root CAN be an 'inside' target (dropping as first child of root).

### Visual Feedback

During drag-over, the target row shows a drop indicator:

- **Before**: 2px blue line at the top edge of the row.
- **After**: 2px blue line at the bottom edge of the row.
- **Inside**: row background highlighted (light blue).

CSS classes:

```css
.mml-outline-drop--before {
  border-top: 2px solid var(--mml-accent);
}
.mml-outline-drop--after {
  border-bottom: 2px solid var(--mml-accent);
}
.mml-outline-drop--inside {
  background-color: var(--mml-drop-bg);
}
```

## Two-Way Sync with Canvas

Both outline and canvas subscribe to the same `MindmapEditor`. Neither view
owns the data; both are projections of `EditorState`.

### Outline → Canvas

- Clicking an outline item: `editor.select(nodeId)`. Canvas updates
  `selectedNodeId`, visually highlighting the node.
- If `selectToCenter` prop is true: canvas also pans/zooms to center the node.
- Pressing Enter in outline: selects node + transfers focus to canvas.

### Canvas → Outline

- Selecting a node in canvas: `editor.select(nodeId)`. Outline highlights the
  corresponding item.
- Adding/deleting/moving nodes in canvas: outline re-renders from the new
  doc state (structural sharing means only affected items re-render).
- If the selected node is inside a collapsed branch in the outline, the
  outline auto-expands ancestors to reveal the selected item.

### Auto-Expand on Selection

When the selected node changes (from canvas), and the selected node is hidden
because an ancestor is collapsed, the outline auto-expends the ancestors:

(replaced by editor-based version above)

This is called by the adapter when `selectedNodeId` changes and the selected
node is not visible in the outline. The auto-expand MUST go through the editor
as a single undoable transaction, not by replacing the doc directly:

```typescript
function ensureVisible(editor: MindmapEditor, nodeId: string): void {
  const doc = editor.getDoc()
  const ops: TransactionOp[] = []
  let parentId = getNode(doc, nodeId)!.parentId
  while (parentId !== null) {
    const parent = getNode(doc, parentId)!
    if (parent.collapsed) {
      ops.push(createToggleCollapsedOp(parentId))
    }
    parentId = parent.parentId
  }
  if (ops.length > 0) {
    editor.apply(buildTransaction(doc, ops))
  }
}
```

Building all toggle ops into one transaction ensures the auto-expand is a
single undo step and the editor's live state is updated through the public
API.

### Scroll to Selected

When the selected item changes, the outline scrolls to bring it into view
(if off-screen). Uses `scrollIntoView({ block: 'nearest' })` on the item's DOM
element via a ref.

## Search and Filter

Optional feature, enabled via `OutlineView` prop `searchable?: boolean`
(default: false).

### Search Input

If `searchable` is true, the `OutlineToolbar` renders a text input. Typing
filters the outline to show only items matching the query (and their ancestors).

### Matching

Search uses a **full plain-text extraction** of the node content, NOT the
truncated `textExcerpt` (which is limited to 80 chars for display). A query
matching text beyond the first 80 characters or outside the first excerpted
block must still match.

```typescript
function fullPlainText(content: NodeContent): string {
  // Walk ALL content blocks depth-first, concatenate ALL text inlines.
  // No truncation, no maxLength. Strip marks.
  // Used for search matching only — not for display.
}

function matchesSearch(node: MindmapNode, query: string): boolean {
  if (!query) return true
  const text = fullPlainText(node.content).toLowerCase()
  return text.includes(query.toLowerCase())
}
```

`textExcerpt` (80 chars, for row display) and `fullPlainText` (unlimited, for
search) are separate functions. Display always uses the excerpt; search always
uses the full text.

### Filter Behavior

- Non-matching nodes are hidden.
- Ancestors of matching nodes are shown (even if they don't match) — needed
  to provide tree context.
- Collapse toggles are disabled during active search (the search controls
  visibility, not the `collapsed` flag).
- Clearing the search restores the normal collapse/expand state.

This filter is view-only: it does NOT modify the document or the `collapsed`
flags. It is a pure rendering filter applied in `OutlineView`.

## Accessibility Contract

Implements MML-B-0004 for the outline view.

### ARIA Roles

| Element      | Role       | Attributes                                        |
| ------------ | ---------- | ------------------------------------------------- |
| OutlineTree  | `tree`     | `aria-label="Mindmap outline"`                    |
| OutlineItem  | `treeitem` | `aria-expanded`, `aria-level`, `aria-selected`    |
| (flat items) | `treeitem` | `aria-posinset`, `aria-setsize` for sibling order |

### ARIA Attributes

- `aria-level`: depth of the node in the tree (root = 1, children = 2, etc.).
- `aria-expanded`: `true` if expanded and has children, `false` if collapsed
  and has children. Omitted if leaf (no children).
- `aria-selected`: `true` if `node.id === selectedId`, `false` otherwise.

### Roving Tabindex

Only the focused item has `tabindex={0}`. All others have `tabindex={-1}`.
Arrow keys move focus. This keeps Tab behavior predictable (Tab moves to the
next focusable element outside the outline, not between outline items).

### Keyboard Focus

The outline tree container has `tabindex={0}` initially (so it can receive
focus on first Tab into it). Once an item is focused, the container's tabindex
becomes `-1` and the focused item gets `tabindex={0}`.

### Screen Reader

- Each `treeitem` has `aria-label` with the text excerpt and child count
  (e.g., "Project plan, 3 children, level 2").
- Collapse/expand state announced via `aria-expanded`.
- Selection announced via `aria-selected`.

## Styling

### CSS Class Convention

| Class                        | Element                                 |
| ---------------------------- | --------------------------------------- |
| `mml-outline`                | Outline panel container                 |
| `mml-outline-toolbar`        | Toolbar (search, collapse-all)          |
| `mml-outline-search`         | Search input                            |
| `mml-outline-tree`           | Scrollable tree container (role=tree)   |
| `mml-outline-item`           | Single item wrapper (role=treeitem)     |
| `mml-outline-item--selected` | Selected item modifier                  |
| `mml-outline-item--focused`  | Keyboard-focused item modifier          |
| `mml-outline-row`            | Row content (toggle + excerpt + badges) |
| `mml-outline-toggle`         | Collapse/expand button                  |
| `mml-outline-excerpt`        | Text excerpt                            |
| `mml-outline-excerpt--empty` | Empty node excerpt                      |
| `mml-outline-badge`          | Badge (child count, etc.)               |
| `mml-outline-drop--before`   | Drop indicator: before                  |
| `mml-outline-drop--after`    | Drop indicator: after                   |
| `mml-outline-drop--inside`   | Drop indicator: inside                  |
| `mml-outline-search-match`   | Search match highlight                  |

### Indentation

Indentation is achieved via `padding-left` based on `aria-level`:

```css
.mml-outline-item {
  padding-left: calc(
    var(--mml-outline-indent, 20px) * (var(--mml-level, 1) - 1)
  );
}
```

The `--mml-level` CSS variable is set via inline style to
`depth + 1` (1-based, matching `aria-level`). The root has
`--mml-level: 1`, producing zero indentation.

## Component Props

```typescript
interface OutlineViewProps {
  editor: MindmapEditor
  selectedId: string | null
  showToolbar?: boolean // default: false
  searchable?: boolean // default: false
  selectToCenter?: boolean // default: false
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean // from MindmapProps
  onNodeDoubleClick?: (nodeId: string, event: React.MouseEvent) => void // from MindmapProps
  className?: string
}
```

`OutlineView` receives these from the parent `Mindmap` component (MML-B-0007).
`confirmDelete` and `onNodeDoubleClick` are forwarded from `MindmapProps` so
outline behavior matches adapter-level config. When `confirmDelete` is
undefined, falls back to `window.confirm`. Not intended for standalone use.

## Implementation Outline

### Phase 1: Core Rendering

1. `OutlineView`: single subscription, build flat visible list, render items as siblings.
2. `OutlineItem`: flat row render (NOT recursive), memoized, receives node + depth as props.
3. `textExcerpt`: plain-text extraction from NodeContent.
4. Node badges (child count, manual position indicator).

### Phase 2: Interaction

1. Click-to-select (`editor.select`).
2. Collapse/expand toggle (`editor.toggleCollapsed`).
3. Auto-expand ancestors when selected node is hidden.
4. Scroll-to-selected (`scrollIntoView`).

### Phase 3: Keyboard Navigation

1. Roving tabindex setup.
2. Arrow key navigation (next/prev visible item algorithm).
3. Home/End (first/last item).
4. Enter (select + transfer focus to canvas).
5. Space (select, keep focus).
6. Delete (with confirm).
7. F2 (select + edit in canvas).

### Phase 4: Drag-and-Drop

1. Drag source setup (`draggable`, `onDragStart`).
2. Drop zone computation (before/after/inside).
3. Visual feedback (drop indicators).
4. Drop action (`editor.moveNode`).
5. Cycle prevention.
6. Root protection (not draggable, not a sibling drop target).

### Phase 5: Search and Filter

1. Search input in toolbar.
2. Matching algorithm.
3. Filter rendering (show matches + ancestors).
4. Collapse toggle disabling during search.

### Phase 6: Accessibility

1. ARIA roles and attributes.
2. Screen reader labels.
3. Roving tabindex finalization.
4. Keyboard-only navigation test.

## Test Plan

### Unit Tests

**Rendering:**

- Renders tree in `childOrder` order.
- Collapsed node hides children.
- Expanded node shows children.
- Leaf node has no collapse toggle.
- Text excerpt: first text node, marks stripped, truncated to 80 chars.
- Empty node shows '(empty)'.
- Node badges: child count shown for branch nodes.
- Indentation matches depth level.

**Selection:**

- Click selects node (`editor.select` called).
- Selected item gets `mml-outline-item--selected` class.
- `aria-selected` reflects selection.
- Selection from canvas reflects in outline.

**Collapse/Expand:**

- Toggle click calls `editor.toggleCollapsed`.
- Collapse All: all non-leaf nodes collapsed.
- Expand All: all nodes expanded.
- ArrowRight expands collapsed node.
- ArrowLeft collapses expanded node.

**Keyboard Navigation:**

- ArrowDown: next visible item focused.
- ArrowUp: previous visible item focused.
- ArrowRight on expanded node: first child focused.
- ArrowLeft on collapsed/leaf node: parent focused.
- Home: root focused.
- End: last visible item focused.
- Enter: node selected, focus transfers to canvas.
- Space: node selected, focus stays in outline.
- Delete: node deleted (with confirm if has children).
- F2: node selected + edit mode in canvas.
- Escape: selection cleared.

**Drag-and-Drop:**

- Drag node onto sibling: reparented correctly.
- Drop 'before': node inserted before target.
- Drop 'after': node inserted after target.
- Drop 'inside': node becomes first child of target.
- Root not draggable.
- Drop on descendant rejected (no-op).
- Visual indicators shown during drag-over.

**Auto-Expand:**

- Selecting a node inside a collapsed branch expands ancestors.
- Scroll-to-selected brings off-screen item into view.

**Search:**

- Search filters to matching nodes + ancestors.
- Non-matching nodes hidden.
- Clearing search restores full tree.
- Collapse toggles disabled during search.

### Performance Tests

- 500 nodes: outline renders without lag.
- Single subscription: no per-item `useEditor` calls.
- Memoized items: unchanged nodes skip re-render.
- Structural sharing: only affected items re-render on mutation.

### Accessibility Tests

- `role="tree"` on container.
- `role="treeitem"` on each item.
- `aria-expanded` correct for branch nodes.
- `aria-level` matches depth.
- `aria-selected` reflects selection.
- Flat list: items use `aria-posinset`/`aria-setsize` for hierarchy.
- Roving tabindex: only focused item has `tabindex={0}`.
- Keyboard navigation works without mouse.
- Screen reader: labels include excerpt + child count.

### Integration Tests

- Canvas + outline two-way sync: add node in canvas, appears in outline.
- Drag in outline: canvas updates parentId and positions.
- Delete in outline: node removed from canvas.
- Layout mode change: outline unaffected (ignores positions).
- Store integration: undo/redo reflects in both views.

## Changelog

- 0.1.0+backlog.0008: Initial draft. Covers component architecture, rendering
  strategy, text excerpts, collapse/expand, keyboard navigation, drag-and-drop
  reparenting, two-way sync, search/filter, accessibility, styling,
  implementation outline, and test plan.
