import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { OutlineView } from '../src/OutlineView.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

function makeEditor(): MindmapEditor {
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

describe('OutlineView drag-drop', () => {
  it('child items are draggable', () => {
    const editor = makeEditor()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items[0].getAttribute('draggable')).toBe('false')
    expect(items[1].getAttribute('draggable')).toBe('true')
  })

  it('dragStart sets dataTransfer', () => {
    const editor = makeEditor()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    const dt = { setData: vi.fn(), getData: vi.fn().mockReturnValue('') }
    fireEvent.dragStart(items[1], { dataTransfer: dt })
    expect(dt.setData).toHaveBeenCalled()
  })

  it('dragOver shows drop indicator on valid target', () => {
    const editor = makeEditor()
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    fireEvent.dragStart(items[1], {
      dataTransfer: { setData: vi.fn(), getData: vi.fn().mockReturnValue('') },
    })
    fireEvent.dragOver(items[2], { clientY: 10 })
    const dropTarget = container.querySelector('[class*="mml-outline-drop"]')
    expect(dropTarget).toBeTruthy()
  })

  it('drop calls moveNode', () => {
    const editor = makeEditor()
    const doc = editor.getDoc()
    const childA = doc.nodes[doc.rootId].childOrder[0]
    const childB = doc.nodes[doc.rootId].childOrder[1]
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    fireEvent.dragStart(items[1], {
      dataTransfer: {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue(childA),
      },
    })
    fireEvent.dragOver(items[2], { clientY: 10 })
    fireEvent.drop(items[2], {
      preventDefault: vi.fn(),
      dataTransfer: { getData: vi.fn().mockReturnValue(childA) },
    })
    expect(editor.getState().doc.nodes[childB].childOrder).toContain(childA)
  })

  it('drop on self is no-op', () => {
    const editor = makeEditor()
    const doc = editor.getDoc()
    const childA = doc.nodes[doc.rootId].childOrder[0]
    const { container } = render(
      <OutlineView editor={editor} selectedId={null} />,
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    fireEvent.dragStart(items[1], {
      dataTransfer: {
        setData: vi.fn(),
        getData: vi.fn().mockReturnValue(childA),
      },
    })
    fireEvent.dragOver(items[1], { clientY: 0 })
    fireEvent.drop(items[1], {
      preventDefault: vi.fn(),
      dataTransfer: { getData: vi.fn().mockReturnValue(childA) },
    })
    expect(editor.getState().doc.nodes[childA]).toBeDefined()
  })
})
