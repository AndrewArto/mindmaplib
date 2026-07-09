import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
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
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 })
    fireEvent.mouseUp(document)
    expect(editor.getState().viewport.x).not.toBe(initialX)
  })

  it('canvas has tabindex for keyboard focus', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    expect(canvas.tabIndex).toBe(0)
  })

  it('does not autofocus canvas when mounted in edit mode', async () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.startEditing(doc.rootId)

    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement

    await waitFor(() => {
      expect(container.querySelector('.mml-node-content--editing')).toBeTruthy()
    })
    expect(document.activeElement).not.toBe(canvas)
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

  it('does not auto-pan back when viewport changes without a selection change', async () => {
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(800)
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(600)
    try {
      const doc = createDoc('Test')
      const editor = new MindmapEditor(doc)
      editor.setLayout('tree-horizontal')
      editor.select(doc.rootId)
      const { container } = render(<Mindmap editor={editor} />)
      const viewport = container.querySelector(
        '.mml-canvas-viewport',
      ) as HTMLElement

      await waitFor(() => {
        expect(editor.getState().viewport.x).toBeGreaterThanOrEqual(39)
      })

      fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 })
      fireEvent.mouseMove(document, { clientX: -1000, clientY: -1000 })
      fireEvent.mouseUp(document)

      await new Promise((resolve) => window.setTimeout(resolve, 0))

      expect(editor.getState().viewport.x).toBeLessThan(-500)
      expect(editor.getState().viewport.y).toBeLessThan(-500)
    } finally {
      widthSpy.mockRestore()
      heightSpy.mockRestore()
    }
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

  // --- MML-B-0010: Real browser pan/drag fix ---

  it('F1: background mousedown calls preventDefault (no text selection)', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    const viewport = container.querySelector(
      '.mml-canvas-viewport',
    ) as HTMLElement

    // Dispatch a real MouseEvent (not fireEvent) to check preventDefault
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      button: 0,
    })
    viewport.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('F1: node mousedown calls preventDefault (no native drag)', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const node = container.querySelector(
      `[data-node-id="${editor.getDoc().rootId}"]`,
    ) as HTMLElement

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
      button: 0,
    })
    node.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('F4: handleMouseDown does not depend on doc (stable callback)', () => {
    // This is a code-structure test: verify the handler doesn't
    // capture stale doc by checking pan works after content change.
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)

    // Add a child (changes doc reference)
    editor.addChild(editor.getDoc().rootId)

    // Pan should still work despite doc change
    const viewport = container.querySelector(
      '.mml-canvas-viewport',
    ) as HTMLElement
    const initialX = editor.getState().viewport.x

    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 })
    fireEvent.mouseUp(document)

    expect(editor.getState().viewport.x).not.toBe(initialX)
  })

  // --- A1: Canvas pan works through child elements (MML-B-0009 adapter) ---

  it('A1: pan starts when mousedown on SVG edge layer (non-node child)', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    // Add children so edges exist
    editor.addChild(editor.getDoc().rootId)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const edgeLayer = container.querySelector('.mml-edges-layer') as HTMLElement
    const initialX = editor.getState().viewport.x

    // mousedown on the SVG edge layer (child of viewport, no data-node-id)
    fireEvent.mouseDown(edgeLayer, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(document, { clientX: 150, clientY: 120 })
    fireEvent.mouseUp(document)

    expect(editor.getState().viewport.x).not.toBe(initialX)
  })

  it('A1: pan works when mousedown on nodes layer background', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const nodesLayer = container.querySelector(
      '.mml-nodes-layer',
    ) as HTMLElement
    const initialX = editor.getState().viewport.x

    fireEvent.mouseDown(nodesLayer, { clientX: 200, clientY: 200 })
    fireEvent.mouseMove(document, { clientX: 250, clientY: 230 })
    fireEvent.mouseUp(document)

    expect(editor.getState().viewport.x).not.toBe(initialX)
  })

  // --- A2: Node drag produces one undo entry (MML-B-0009 adapter) ---

  it('A2: dragging a node creates exactly one undo entry', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const nodeId = editor.getDoc().rootId
    const { container } = render(<Mindmap editor={editor} />)
    const node = container.querySelector(
      `[data-node-id="${nodeId}"]`,
    ) as HTMLElement

    // Simulate drag with multiple mousemove events
    fireEvent.mouseDown(node, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(document, { clientX: 30, clientY: 30 })
    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 })
    fireEvent.mouseMove(document, { clientX: 70, clientY: 70 })
    fireEvent.mouseMove(document, { clientX: 90, clientY: 90 })
    fireEvent.mouseUp(document)

    // Count how many undos it takes to revert the drag
    let undosToRevert = 0
    const posAfterDrag = editor.getDoc().nodes[nodeId].position
    while (editor.canUndo() && undosToRevert < 10) {
      editor.undo()
      undosToRevert++
      const pos = editor.getDoc().nodes[nodeId].position
      // Check if position reverted to pre-drag state
      if (pos !== posAfterDrag) break
    }

    // Should be exactly 1 undo to revert the entire drag
    expect(undosToRevert).toBe(1)
  })

  it('A2: undo after drag returns node to pre-drag position', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const nodeId = editor.getDoc().rootId
    const { container } = render(<Mindmap editor={editor} />)
    const node = container.querySelector(
      `[data-node-id="${nodeId}"]`,
    ) as HTMLElement

    const beforeDrag = { ...editor.getDoc().nodes[nodeId].position! }

    fireEvent.mouseDown(node, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(document, { clientX: 80, clientY: 60 })
    fireEvent.mouseUp(document)

    // Position should have changed
    expect(editor.getDoc().nodes[nodeId].position).not.toEqual(beforeDrag)

    // Single undo reverts to pre-drag position
    editor.undo()
    const afterUndo = editor.getDoc().nodes[nodeId].position
    expect(afterUndo).toEqual(beforeDrag)
  })
})

// =========================================================================
// MML-B-0011: Keyboard focus, edit click-away, content persistence
// =========================================================================

describe('MML-B-0011: focus and click-away', () => {
  it('B2: mousedown on node focuses canvas', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    const node = container.querySelector('[data-node-id]') as HTMLElement

    fireEvent.mouseDown(node, { clientX: 10, clientY: 10 })
    expect(document.activeElement).toBe(canvas)
  })

  it('B3: background mousedown exits edit mode (click-away)', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const nodeId = editor.addChild(doc.rootId)
    editor.startEditing(nodeId)

    expect(editor.getState().editingNodeId).toBe(nodeId)

    const { container } = render(<Mindmap editor={editor} />)
    const canvas = container.querySelector('.mml-canvas') as HTMLElement

    // Click on background — should exit edit mode
    fireEvent.mouseDown(canvas, { clientX: 500, clientY: 500 })

    expect(editor.getState().editingNodeId).toBeNull()
  })

  it('B3b: clicking another node exits edit mode and focuses clicked node', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    const id1 = editor.addChild(doc.rootId)
    const id2 = editor.addChild(doc.rootId)
    editor.startEditing(id1)

    const { container } = render(<Mindmap editor={editor} />)
    const otherNode = container.querySelector(
      `[data-node-id="${id2}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(otherNode, { clientX: 200, clientY: 200 })

    const state = editor.getState()
    expect(state.editingNodeId).toBeNull()
    expect(state.selectedNodeId).toBe(id2)
  })
})

// =========================================================================
// MML-B-0012: Global undo/redo keyboard shortcut
// =========================================================================

describe('MML-B-0012: global undo/redo', () => {
  it('Cmd+Z undoes even when canvas does not have focus', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.setLayout('tree-horizontal')
    editor.addChild(doc.rootId)
    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)

    const { unmount } = render(<Mindmap editor={editor} />)

    // Ensure canvas does NOT have focus (simulate focus on unrelated UI).
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    // Dispatch Cmd+Z as a document-level event (real user keydown)
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    // Undo should have worked despite no canvas focus
    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(0)
    expect(event.defaultPrevented).toBe(true)

    document.body.removeChild(button)
    unmount()
  })

  it('Cmd+Shift+Z redoes even when canvas does not have focus', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.undo()
    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(0)

    render(<Mindmap editor={editor} />)
    document.body.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)
  })

  it('Ctrl+Y also triggers redo (Windows/Linux)', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)
    editor.undo()

    render(<Mindmap editor={editor} />)
    document.body.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'y',
      code: 'KeyY',
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)
  })

  it('does not intercept Cmd+Z when focus is in an input field', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)

    render(<Mindmap editor={editor} />)

    // Simulate focus in an input element
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    // Should NOT undo — input has focus
    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)
    expect(event.defaultPrevented).toBe(false)

    document.body.removeChild(input)
  })

  it('does not intercept Cmd+Z during text editing', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const childId = editor.addChild(doc.rootId)
    editor.startEditing(childId)

    render(<Mindmap editor={editor} />)

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    // Should NOT undo — editing mode is active
    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)
    expect(event.defaultPrevented).toBe(false)
  })

  it('cleans up document listener on unmount', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    editor.addChild(doc.rootId)

    const { unmount } = render(<Mindmap editor={editor} />)
    unmount()

    // After unmount, Cmd+Z should not trigger undo
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(editor.getDoc().nodes[doc.rootId].childOrder.length).toBe(1)
  })
})
