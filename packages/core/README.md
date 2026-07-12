# @mindmaplib/core

Framework-agnostic TypeScript mind map engine: document model, transactions, undo and redo, layout, serialization, selection, and storage interface.

Part of [mindmaplib](https://github.com/AndrewArto/mindmaplib), an embeddable rich-text mind map and outline editor for web applications. MIT licensed.

## Install

```bash
pnpm add @mindmaplib/core
```

Applications that need the ready-made React UI should install both packages:

```bash
pnpm add @mindmaplib/core @mindmaplib/react
```

## Quick start

```typescript
import { createDoc, MindmapEditor, serialize } from '@mindmaplib/core'

const doc = createDoc('My Map')
const editor = new MindmapEditor(doc)

const root = editor.getDoc().rootId
const childId = editor.addChild(root)

editor.setLayout('tree-horizontal')
editor.setSelection([root, childId])
editor.commitPositions([
  { nodeId: root, position: { x: 100, y: 80 } },
  { nodeId: childId, position: { x: 300, y: 80 } },
])

const json = serialize(editor.getDoc())

editor.undo()
editor.redo()
```

To discard positions previously set by manual node dragging before an automatic reflow:

```typescript
editor.setLayout('tree-vertical', { resetManualPositions: true })
```

## Architecture

- Document model: immutable `MindmapDoc` with a flat node map and explicit child order.
- Mutations: transactional operations with an in-memory undo and redo history.
- Layout: tree and radial layouts computed with `d3-hierarchy`.
- Selection: ordered multi-selection and atomic position transactions.
- Storage: a host-implemented `MindmapStore` interface, with an in-memory default.
- Runtime: no React or DOM dependencies.

See the [repository](https://github.com/AndrewArto/mindmaplib) for specifications, API source, tests, and the React adapter.

## License

MIT
