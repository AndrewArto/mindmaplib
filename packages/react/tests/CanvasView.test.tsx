import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Mindmap } from '../src/Mindmap.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

describe('CanvasView pan/zoom', () => {
  it('wheel zoom changes viewport zoom', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    const initialZoom = editor.getState().viewport.zoom
    fireEvent.wheel(canvas, { deltaY: 100, preventDefault: vi.fn() })
    const newZoom = editor.getState().viewport.zoom
    expect(newZoom).not.toBe(initialZoom)
  })

  it('wheel zoom up (negative deltaY) increases zoom', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    const initialZoom = editor.getState().viewport.zoom
    fireEvent.wheel(canvas, { deltaY: -500, preventDefault: vi.fn() })
    expect(editor.getState().viewport.zoom).toBeGreaterThan(initialZoom)
  })

  it('background mouseDown starts pan', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const viewport = container.querySelector(
      '.mml-canvas-viewport',
    ) as HTMLElement
    const initialX = editor.getState().viewport.x
    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(viewport, { clientX: 150, clientY: 120 })
    fireEvent.mouseUp(viewport)
    expect(editor.getState().viewport.x).not.toBe(initialX)
  })

  it('canvas has tabindex for keyboard focus', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    expect(canvas.tabIndex).toBe(0)
  })

  it('canvas renders SVG edge layer', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('.mml-edges-layer')).toBeTruthy()
  })

  it('canvas renders HTML node layer', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('.mml-nodes-layer')).toBeTruthy()
  })

  it('viewport transform CSS includes translate and scale', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const viewport = container.querySelector(
      '.mml-canvas-viewport',
    ) as HTMLElement
    expect(viewport.style.transform).toContain('translate')
    expect(viewport.style.transform).toContain('scale')
  })

  it('dragging a node updates its position', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const nodeId = editor.getDoc().rootId
    const before = editor.getDoc().nodes[nodeId].position
    const { container } = render(<Mindmap editor={editor} />)
    const node = container.querySelector(
      `[data-node-id="${nodeId}"]`,
    ) as HTMLElement
    const canvas = container.querySelector('.mml-canvas') as HTMLElement

    fireEvent.mouseDown(node, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 60 })
    fireEvent.mouseUp(canvas)

    expect(editor.getDoc().nodes[nodeId].position).not.toEqual(before)
  })
})
