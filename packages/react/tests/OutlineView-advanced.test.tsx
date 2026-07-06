import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OutlineView } from '../src/OutlineView.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

function makeDeepTree(): MindmapEditor {
  const doc = createDoc('Root Node')
  const editor = new MindmapEditor(doc)
  const c1 = editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
      ],
    },
  })
  editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
      ],
    },
  })
  editor.addChild(c1, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha Child' }] },
      ],
    },
  })
  return editor
}

describe('OutlineView advanced', () => {
  it('shows collapse/expand all buttons with toolbar', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} showToolbar />,
    )
    expect(container.querySelector('.mml-outline-collapse-all')).toBeTruthy()
    expect(container.querySelector('.mml-outline-expand-all')).toBeTruthy()
  })

  it('collapse all hides all children', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} showToolbar />,
    )
    expect(container.querySelectorAll('[role="treeitem"]').length).toBe(4)
    fireEvent.click(container.querySelector('.mml-outline-collapse-all')!)
    expect(container.querySelectorAll('[role="treeitem"]').length).toBe(1)
  })

  it('expand all shows all nodes', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} showToolbar />,
    )
    fireEvent.click(container.querySelector('.mml-outline-collapse-all')!)
    expect(container.querySelectorAll('[role="treeitem"]').length).toBe(1)
    fireEvent.click(container.querySelector('.mml-outline-expand-all')!)
    expect(container.querySelectorAll('[role="treeitem"]').length).toBe(4)
  })

  it('aria-expanded reflects expansion state', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const rootItem = container.querySelector('[role="treeitem"]')
    expect(rootItem?.getAttribute('aria-expanded')).toBe('true')
  })

  it('aria-posinset and aria-setsize correct', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    // Root: posInSet=1, setSize=1
    expect(items[0].getAttribute('aria-posinset')).toBe('1')
    expect(items[0].getAttribute('aria-setsize')).toBe('1')
    // Alpha (first child of root): posInSet=1, setSize=2
    expect(items[1].getAttribute('aria-posinset')).toBe('1')
    expect(items[1].getAttribute('aria-setsize')).toBe('2')
    // Alpha Child (only child of Alpha): posInSet=1, setSize=1
    expect(items[2].getAttribute('aria-posinset')).toBe('1')
    expect(items[2].getAttribute('aria-setsize')).toBe('1')
    // Beta (second child of root): posInSet=2, setSize=2
    expect(items[3].getAttribute('aria-posinset')).toBe('2')
    expect(items[3].getAttribute('aria-setsize')).toBe('2')
  })

  it('child count badge shown for nodes with children', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    expect(
      container.querySelectorAll('.mml-outline-badge').length,
    ).toBeGreaterThan(0)
  })

  it('empty nodes show (empty) excerpt', () => {
    const doc = createDoc('')
    const editor = new MindmapEditor(doc)
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    expect(container.querySelector('.mml-outline-excerpt--empty')).toBeTruthy()
  })

  it('Enter selects node', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'Enter' })
    expect(editor.getState().selectedNodeId).not.toBeNull()
  })

  it('ArrowDown moves focus', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })

  it('Escape deselects', () => {
    const editor = makeDeepTree()
    const doc = editor.getDoc()
    editor.select(doc.rootId)
    const { container } = render(
      <OutlineView editor={editor} selectedId={doc.rootId} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'Escape' })
    expect(editor.getState().selectedNodeId).toBeNull()
  })

  it('Delete removes non-root node', async () => {
    const editor = makeDeepTree()
    const doc = editor.getDoc()
    const firstChild = doc.nodes[doc.rootId].childOrder[0]
    const origConfirm = window.confirm
    window.confirm = () => true
    const { container } = render(
      <OutlineView editor={editor} selectedId={firstChild} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'Delete' })
    await Promise.resolve()
    window.confirm = origConfirm
    expect(editor.getState().doc.nodes[firstChild]).toBeUndefined()
  })

  it('F2 enters edit mode', () => {
    const editor = makeDeepTree()
    const doc = editor.getDoc()
    editor.select(doc.rootId)
    const { container } = render(
      <OutlineView editor={editor} selectedId={doc.rootId} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'F2' })
    expect(editor.getState().editingNodeId).not.toBeNull()
  })

  it('Home moves focus to first item', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'Home' })
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })

  it('End moves focus to last item', () => {
    const editor = makeDeepTree()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    fireEvent.focus(tree)
    fireEvent.keyDown(tree, { key: 'End' })
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })
})
