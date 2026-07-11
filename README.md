# mindmaplib

An embeddable rich-text mindmap and outline editor for SaaS products. Not a
generic graph toolkit — a production-grade drop-in layer for structured
thinking, planning, knowledge trees, project breakdowns, AI-generated maps,
and internal portals.

## Why

Most mindmap tools are standalone apps. Most canvas libraries are generic
graph toolkits that leave you rebuilding pan/zoom/edit/outline from scratch.

mindmaplib fills the gap: a library that gives you a complete mindmap editor
— canvas with spatial layout, synchronized outline panel, rich-text nodes,
full keyboard navigation, and a storage interface you control. Drop it into
your React app, plug in your database, ship.

## What you get

- **Canvas view** — pan, zoom, Shift-drag marquee selection, atomic multi-node
  drag, draw edges, inline rich-text
  editing. SVG edges + HTML content layer. Single viewport transform.
- **Outline view** — hierarchical indented list, synced to the same document.
  Collapse/expand, drag-and-drop reparenting, click-to-focus in canvas.
- **Rich text in nodes** — TipTap v3 (MIT) for editing. One active editor
  instance at a time. Static HTML rendering for all other nodes.
- **Keyboard navigation** — Tab/Enter/arrows for tree building and
  navigation. Full shortcuts table in the spec.
- **Layout modes** — free-float (manual), tree horizontal, tree vertical,
  radial (via d3-hierarchy).
- **Immutable document model** — transactional mutations, undo/redo,
  serializable state. Collaboration-ready architecture (CRDT-ready, not
  built yet).
- **Storage-agnostic** — you own persistence. Implement the `MindmapStore`
  interface against Postgres, D1, IndexedDB, anything. In-memory default
  ships with core.
- **Framework-agnostic core** — `@mindmaplib/core` has zero React/DOM
  dependencies. React adapter is first-class; Vue/Svelte adapters planned.

## Architecture

```
@mindmaplib/core          Framework-agnostic engine
├── Document model        Immutable flat node map + childOrder
├── Transactions          Serializable TransactionOp, applyOp, undo/redo
├── Validation            Document invariants, validateDoc, MindmapError
├── Layout                d3-hierarchy with nodeMeasures
├── Serialization         JSON with schemaVersion + migration policy
└── Store interface       MindmapStore (host-implemented), InMemoryStore

@mindmaplib/react         React adapter
├── CanvasView            SVG edges + HTML nodes, viewport transform
├── OutlineView           Hierarchical list, two-way sync
├── NodeView              Static HTML render + TipTap on edit
├── Keyboard navigation   Full keymap, suspended during text editing
└── Sanitization          DOMPurify on all generated HTML

demo                      Vite playground (not published to npm)
```

## Install

```bash
pnpm add @mindmaplib/core @mindmaplib/react
```

React 18.3+ or 19.x required as a peer dependency.

## Quick start

```tsx
import { createDoc, MindmapEditor } from '@mindmaplib/core'
import { Mindmap } from '@mindmaplib/react'

const doc = createDoc('My Map')
const editor = new MindmapEditor(doc)

export default function App() {
  return <Mindmap editor={editor} />
}
```

## Status

Early development. Private repo — will go open source (MIT) once the core
engine and React adapter are stable.

Specification: [MML-B-0001 Core Engine](docs/specs/MML-B-0001_CORE_ENGINE_SPEC.md)

## License

MIT
