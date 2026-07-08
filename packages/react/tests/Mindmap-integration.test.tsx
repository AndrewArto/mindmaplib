import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { Mindmap } from '../src/Mindmap.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

function makeEditor(): MindmapEditor {
  const doc = createDoc('Root')
  const editor = new MindmapEditor(doc)
  editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Child 1' }] },
      ],
    },
  })
  editor.addChild(doc.rootId, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Child 2' }] },
      ],
    },
  })
  return editor
}

describe('Mindmap integration', () => {
  it('renders canvas with nodes', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    const nodes = container.querySelectorAll('[data-node-id]')
    expect(nodes.length).toBe(3)
  })

  it('renders edges between nodes after layout', () => {
    const editor = makeEditor()
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const edges = container.querySelectorAll('.mml-edge')
    expect(edges.length).toBe(2)
  })

  it('renders background grid by default', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('.mml-background-grid')).toBeTruthy()
  })

  it('hides grid when showGrid=false', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} showGrid={false} />)
    expect(container.querySelector('.mml-background-grid')).toBeNull()
  })

  it('renders dots grid by default', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('.mml-background-grid--dots')).toBeTruthy()
  })

  it('renders lines grid when configured', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} gridType="lines" />)
    expect(container.querySelector('.mml-background-grid--lines')).toBeTruthy()
  })

  it('renders canvas with role=application', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('[role="application"]')).toBeTruthy()
  })

  it('opens with the root selected and canvas focused when no previous focus exists', async () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )

    await waitFor(() => {
      expect(editor.getState().selectedNodeId).toBe(doc.rootId)
    })
    expect(document.activeElement).toBe(container.querySelector('.mml-canvas'))
  })

  it('opens with the existing last selected node when one is already known', () => {
    const doc = createDoc('Root')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.select(childId)
    render(<Mindmap editor={editor} showOutline={false} />)

    expect(editor.getState().selectedNodeId).toBe(childId)
  })

  it('renders outline tree with role=tree', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('[role="tree"]')).toBeTruthy()
  })

  it('outline shows all visible nodes', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} />)
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items.length).toBe(3)
  })

  it('outline syncs selection from canvas', () => {
    const editor = makeEditor()
    const doc = editor.getDoc()
    const firstChild = doc.nodes[doc.rootId].childOrder[0]
    const { container } = render(<Mindmap editor={editor} />)
    const items = container.querySelectorAll('[role="treeitem"]')
    fireEvent.click(items[1])
    expect(editor.getState().selectedNodeId).toBe(firstChild)
  })

  it('fires onSelectionChange when selection changes', () => {
    const editor = makeEditor()
    const doc = editor.getDoc()
    editor.select(doc.rootId)
    const onSelectionChange = vi.fn()
    render(<Mindmap editor={editor} onSelectionChange={onSelectionChange} />)
    const firstChild = doc.nodes[doc.rootId].childOrder[0]
    act(() => editor.select(firstChild))
    expect(onSelectionChange).toHaveBeenCalledWith(firstChild)
  })

  it('renders with custom outline width', () => {
    const editor = makeEditor()
    const { container } = render(<Mindmap editor={editor} outlineWidth={400} />)
    const outlineWrapper = container.querySelector(
      '.mml-outline-wrapper',
    ) as HTMLElement
    expect(outlineWrapper.style.width).toBe('400px')
  })
})
