import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutlineView } from '../src/OutlineView.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

function makeEditorWithTree(): MindmapEditor {
  const doc = createDoc('Root')
  const editor = new MindmapEditor(doc)
  editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Child A' }] },
      ],
    },
  })
  editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Child B' }] },
      ],
    },
  })
  return editor
}

describe('OutlineView', () => {
  it('renders tree in childOrder', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items.length).toBe(3) // root + 2 children
  })

  it('shows text excerpts', () => {
    const editor = makeEditorWithTree()
    render(<OutlineView editor={editor} selectedId={null} />)
    expect(screen.getByText('Child A')).toBeTruthy()
    expect(screen.getByText('Child B')).toBeTruthy()
  })

  it('root is not draggable', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const rootItem = container.querySelector('[role="treeitem"]')
    expect(rootItem?.getAttribute('draggable')).toBe('false')
  })

  it('click selects node', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    fireEvent.click(items[1])
    expect(editor.getState().selectedNodeId).not.toBeNull()
  })

  it('collapse hides children', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const toggle = container.querySelector('.mml-outline-toggle')
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle!)
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items.length).toBe(1) // only root visible after collapse
  })

  it('renders search input when searchable', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} searchable />,
    )
    expect(container.querySelector('.mml-outline-search')).toBeTruthy()
  })

  it('search filters results', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} searchable />,
    )
    const input = container.querySelector(
      '.mml-outline-search',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Child A' } })
    const items = container.querySelectorAll('[role="treeitem"]')
    // Root + Child A (Child B filtered out)
    expect(items.length).toBe(2)
  })

  it('renders ARIA attributes correctly', () => {
    const editor = makeEditorWithTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const tree = container.querySelector('[role="tree"]')
    expect(tree).toBeTruthy()
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items[0].getAttribute('aria-level')).toBe('1') // root
    expect(items[1].getAttribute('aria-level')).toBe('2') // child
  })
})
