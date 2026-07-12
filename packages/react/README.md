# @mindmaplib/react

The React adapter for [mindmaplib](https://github.com/AndrewArto/mindmaplib): an embeddable rich-text mind map and outline editor for web applications.

It provides the production UI layer on top of `@mindmaplib/core`: canvas rendering, synchronized outline, rich-text nodes, pan and zoom, keyboard navigation, marquee selection, group dragging, and drag-and-drop reparenting.

## Install

```bash
pnpm add @mindmaplib/core @mindmaplib/react
```

React 18.3 or 19 is required as a peer dependency.

## Quick start

```tsx
import { createDoc, MindmapEditor } from '@mindmaplib/core'
import { Mindmap } from '@mindmaplib/react'
import '@mindmaplib/react/styles.css'

const editor = new MindmapEditor(createDoc('My Map'))

export default function App() {
  return <Mindmap editor={editor} />
}
```

Keep the `MindmapEditor` instance stable across React renders. In a component, create it with `useState` or `useMemo` rather than constructing it in the render body.

```tsx
import { useState } from 'react'
import { createDoc, MindmapEditor } from '@mindmaplib/core'
import { Mindmap } from '@mindmaplib/react'
import '@mindmaplib/react/styles.css'

export default function App() {
  const [editor] = useState(
    () => new MindmapEditor(createDoc('Product planning')),
  )

  return <Mindmap editor={editor} />
}
```

## Persistence

The adapter does not impose a backend. Implement the `MindmapStore` interface from `@mindmaplib/core` and pass it when creating the editor.

```tsx
const editor = new MindmapEditor(doc, { store: myStore })
```

The host application owns authentication, persistence, and product-specific controls.

## Custom composition

For advanced integrations, the package also exports `CanvasView`, `OutlineView`, `NodeView`, `EdgeView`, hooks, renderer types, and text utilities from its public entry point.

See the [repository](https://github.com/AndrewArto/mindmaplib) and [live demo](https://mapdemo.tripleadigital.io/) for the complete implementation and interaction model.

## License

MIT
