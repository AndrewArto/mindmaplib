# @mindmaplib/core

Framework-agnostic mindmap engine: document model, transactions, undo/redo,
layout, serialization, and storage interface.

Part of [mindmaplib](../../README.md) — an embeddable rich-text mindmap and
outline editor for SaaS products. MIT licensed.

## Install

```bash
pnpm add @mindmaplib/core
```

## Quick start

```typescript
import { createDoc, MindmapEditor } from '@mindmaplib/core'

const doc = createDoc('My Map')
const editor = new MindmapEditor(doc)

// Mutate
const root = editor.getDoc().rootId
const childId = editor.addChild(root)

// Serialize
import { serialize } from '@mindmaplib/core'
const json = serialize(editor.getDoc())

// Layout
editor.setLayout('tree-horizontal')

// Undo/redo
editor.undo()
editor.redo()
```

## Architecture

- **Document model**: immutable `MindmapDoc` — flat node map, tree emerges
  from `parentId` links. One root, no orphans.
- **Mutations**: transactional. Every change flows through `Transaction.apply`,
  producing a new `MindmapDoc`. Undo/redo is an in-memory ring buffer.
- **Layout**: `d3-hierarchy` computes positions for auto-layout modes.
- **Storage**: library exports `MindmapStore` interface. Host implements it
  against any backend. In-memory default ships with core.

See [MML-B-0001 Core Engine Spec](../../docs/specs/MML-B-0001_CORE_ENGINE_SPEC.md)
for full architecture, data model, and API surface.

## License

MIT
