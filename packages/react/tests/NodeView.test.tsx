import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodeView } from '../src/NodeView.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'
import { DEFAULT_TIPTAP_EXTENSIONS } from '../src/tiptapExtensions.js'
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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

  it('renders and preserves link content through the default editing lifecycle without duplicate warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const doc = createDoc('Linked root')
    const editor = new MindmapEditor(doc)
    const linkContent: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'mindmaplib',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://github.com/AndrewArto/mindmaplib' },
                },
              ],
            },
          ],
        },
      ],
    }
    editor.updateContent(doc.rootId, linkContent)
    editor.select(doc.rootId)
    const exitRef = createRef<(() => void) | null>()
    const { container, rerender } = render(
      <div className="mml-canvas" tabIndex={0}>
        <NodeView
          node={editor.getDoc().nodes[doc.rootId]}
          editor={editor}
          isSelected={true}
          isEditing={false}
          exitEditModeRef={exitRef}
        />
      </div>,
    )

    const anchorElement = container.querySelector('a')
    expect(anchorElement?.textContent).toBe('mindmaplib')
    expect(anchorElement?.getAttribute('href')).toBe(
      'https://github.com/AndrewArto/mindmaplib',
    )

    editor.startEditing(doc.rootId)
    rerender(
      <div className="mml-canvas" tabIndex={0}>
        <NodeView
          node={editor.getDoc().nodes[doc.rootId]}
          editor={editor}
          isSelected={true}
          isEditing={true}
          exitEditModeRef={exitRef}
        />
      </div>,
    )
    const editingContent = await waitFor(() => {
      const element = container.querySelector(
        '.mml-node-content--editing',
      ) as HTMLElement | null
      expect(element).toBeTruthy()
      return element!
    })
    fireEvent.keyDown(editingContent, { key: 'Enter' })

    await waitFor(() => expect(editor.getState().editingNodeId).toBeNull())
    expect(JSON.stringify(editor.getDoc().nodes[doc.rootId].content)).toContain(
      '"type":"link"',
    )
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes('Duplicate extension names found'),
      ),
    ).toEqual([])
    warn.mockRestore()
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
    const extensions = DEFAULT_TIPTAP_EXTENSIONS
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
