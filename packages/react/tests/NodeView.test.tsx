import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodeView } from '../src/NodeView.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { createRef } from 'react'
import type { MindmapNode, NodeContent } from '@mindmaplib/core'

function makeNode(overrides: Partial<MindmapNode> = {}): MindmapNode {
  const content: NodeContent = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    ],
  }
  return {
    id: 'node1',
    parentId: 'root',
    position: { x: 100, y: 50 },
    manualPosition: false,
    content,
    collapsed: false,
    childOrder: [],
    ...overrides,
  }
}

describe('NodeView', () => {
  it('renders static HTML content', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const node = makeNode()
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    render(
      <NodeView
        node={node}
        editor={editor}
        isSelected={false}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('positions node at document coordinates', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const node = makeNode({ position: { x: 200, y: 300 } })
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <NodeView
        node={node}
        editor={editor}
        isSelected={false}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    const nodeEl = container.querySelector('.mml-node') as HTMLElement
    expect(nodeEl.style.left).toBe('200px')
    expect(nodeEl.style.top).toBe('300px')
  })

  it('applies selected class when isSelected', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const node = makeNode()
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <NodeView
        node={node}
        editor={editor}
        isSelected={true}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    expect(container.querySelector('.mml-node--selected')).toBeTruthy()
  })

  it('click selects node', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const root = doc.nodes[doc.rootId]
    const exitRef = createRef<(() => void) | null>()
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <NodeView
        node={root}
        editor={editor}
        isSelected={false}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    const nodeEl = container.querySelector('.mml-node') as HTMLElement
    fireEvent.mouseDown(nodeEl)
    expect(editor.getState().selectedNodeId).toBe(doc.rootId)
  })

  it('sets data-node-id attribute', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const node = makeNode({ id: 'custom-id' })
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <NodeView
        node={node}
        editor={editor}
        isSelected={false}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    const nodeEl = container.querySelector('[data-node-id]')
    expect(nodeEl?.getAttribute('data-node-id')).toBe('custom-id')
  })

  it('Enter exits text editing, keeps node selected, and returns focus to canvas', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const root = doc.nodes[doc.rootId]
    editor.select(doc.rootId)
    editor.startEditing(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <div className="mml-canvas" tabIndex={0}>
        <NodeView
          node={root}
          editor={editor}
          isSelected={true}
          isEditing={true}
          tiptapExtensions={extensions}
          exitEditModeRef={exitRef}
        />
      </div>,
    )

    const editingContent = await waitFor(() => {
      const el = container.querySelector(
        '.mml-node-content--editing',
      ) as HTMLElement | null
      expect(el).toBeTruthy()
      return el!
    })

    fireEvent.keyDown(editingContent, { key: 'Enter' })

    await waitFor(() => {
      expect(editor.getState().editingNodeId).toBeNull()
    })
    expect(editor.getState().selectedNodeId).toBe(doc.rootId)
    await waitFor(() => {
      expect(document.activeElement).toBe(
        container.querySelector('.mml-canvas'),
      )
    })
  })

  it('Escape exits text editing, keeps node selected, and returns focus to canvas', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const root = doc.nodes[doc.rootId]
    editor.select(doc.rootId)
    editor.startEditing(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <div className="mml-canvas" tabIndex={0}>
        <NodeView
          node={root}
          editor={editor}
          isSelected={true}
          isEditing={true}
          tiptapExtensions={extensions}
          exitEditModeRef={exitRef}
        />
      </div>,
    )

    const editingContent = await waitFor(() => {
      const el = container.querySelector(
        '.mml-node-content--editing',
      ) as HTMLElement | null
      expect(el).toBeTruthy()
      return el!
    })

    fireEvent.keyDown(editingContent, { key: 'Escape' })

    await waitFor(() => {
      expect(editor.getState().editingNodeId).toBeNull()
    })
    expect(editor.getState().selectedNodeId).toBe(doc.rootId)
    await waitFor(() => {
      expect(document.activeElement).toBe(
        container.querySelector('.mml-canvas'),
      )
    })
  })

  it('sanitizes generated HTML', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const exitRef = createRef<(() => void) | null>()
    const maliciousContent: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>alert(1)</script>safe' }],
        },
      ],
    }
    const node = makeNode({ content: maliciousContent })
    const extensions = [StarterKit, Link.configure({ openOnClick: false })]
    const { container } = render(
      <NodeView
        node={node}
        editor={editor}
        isSelected={false}
        isEditing={false}
        tiptapExtensions={extensions}
        exitEditModeRef={exitRef}
      />,
    )
    expect(container.innerHTML).not.toContain('<script>')
  })
})
