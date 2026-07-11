import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MindmapEditor, createDoc } from '@mindmaplib/core'
import { Mindmap } from '../src/Mindmap.js'

function manualEditor() {
  const doc = createDoc('Marquee')
  const editor = new MindmapEditor(doc)
  const first = editor.addChild(doc.rootId)
  const second = editor.addChild(doc.rootId)
  const control = editor.addChild(doc.rootId)
  editor.setPosition(doc.rootId, { x: 80, y: 20 })
  editor.setPosition(first, { x: 150, y: 100 })
  editor.setPosition(second, { x: 300, y: 110 })
  editor.setPosition(control, { x: 520, y: 300 })
  editor.select(doc.rootId)
  return { editor, root: doc.rootId, first, second, control }
}

describe('CanvasView marquee selection', () => {
  it('uses Shift plus left drag on the background to replace selection', () => {
    const { editor, first, second, control } = manualEditor()
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    const viewportBefore = editor.getState().viewport

    fireEvent.mouseDown(canvas, {
      button: 0,
      shiftKey: true,
      clientX: 140,
      clientY: 90,
    })
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 430,
      clientY: 180,
    })

    expect(container.querySelector('.mml-selection-marquee')).toBeTruthy()
    expect(container.querySelectorAll('.mml-node--selected')).toHaveLength(2)

    fireEvent.mouseUp(document, { button: 0, clientX: 430, clientY: 180 })

    expect(container.querySelector('.mml-selection-marquee')).toBeNull()
    expect(editor.getState().selectedNodeIds).toEqual([first, second])
    expect(editor.getState().selectedNodeIds).not.toContain(control)
    expect(editor.getState().viewport).toEqual(viewportBefore)
  })

  it('ignores right-button release while a left-button marquee is active', () => {
    const { editor, first, second } = manualEditor()
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const canvas = container.querySelector('.mml-canvas') as HTMLElement

    fireEvent.mouseDown(canvas, {
      button: 0,
      shiftKey: true,
      clientX: 140,
      clientY: 90,
    })
    fireEvent.mouseMove(document, { buttons: 1, clientX: 430, clientY: 180 })
    fireEvent.mouseUp(document, { button: 2, buttons: 1 })

    expect(container.querySelector('.mml-selection-marquee')).toBeTruthy()

    fireEvent.mouseUp(document, { button: 0, buttons: 0 })
    expect(editor.getState().selectedNodeIds).toEqual([first, second])
  })

  it('does not commit a marquee below the movement threshold', () => {
    const { editor, root } = manualEditor()
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const canvas = container.querySelector('.mml-canvas') as HTMLElement

    fireEvent.mouseDown(canvas, {
      button: 0,
      shiftKey: true,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 103,
      clientY: 102,
    })
    fireEvent.mouseUp(document, { button: 0, clientX: 103, clientY: 102 })

    expect(container.querySelector('.mml-selection-marquee')).toBeNull()
    expect(editor.getState().selectedNodeIds).toEqual([root])
  })

  it('leaves right mouse interaction to the browser', () => {
    const { editor, root } = manualEditor()
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const canvas = container.querySelector('.mml-canvas') as HTMLElement
    const viewportBefore = editor.getState().viewport

    fireEvent.mouseDown(canvas, { button: 2, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(document, {
      buttons: 2,
      clientX: 300,
      clientY: 250,
    })
    fireEvent.mouseUp(document, { button: 2, clientX: 300, clientY: 250 })

    expect(editor.getState().viewport).toEqual(viewportBefore)
    expect(editor.getState().selectedNodeIds).toEqual([root])
    expect(container.querySelector('.mml-selection-marquee')).toBeNull()
  })
})

describe('CanvasView selected group drag', () => {
  it('moves every selected node by one delta and undoes the group once', () => {
    const { editor, first, second, control } = manualEditor()
    editor.setSelection([first, second])
    const firstBefore = { ...editor.getDoc().nodes[first]!.position! }
    const secondBefore = { ...editor.getDoc().nodes[second]!.position! }
    const controlBefore = { ...editor.getDoc().nodes[control]!.position! }
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const firstNode = container.querySelector(
      `[data-node-id="${first}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(firstNode, {
      button: 0,
      clientX: firstBefore.x + 10,
      clientY: firstBefore.y + 10,
    })
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: firstBefore.x + 90,
      clientY: firstBefore.y + 50,
    })
    fireEvent.mouseUp(document, {
      button: 0,
      clientX: firstBefore.x + 90,
      clientY: firstBefore.y + 50,
    })

    expect(editor.getDoc().nodes[first]!.position).toEqual({
      x: firstBefore.x + 80,
      y: firstBefore.y + 40,
    })
    expect(editor.getDoc().nodes[second]!.position).toEqual({
      x: secondBefore.x + 80,
      y: secondBefore.y + 40,
    })
    expect(editor.getDoc().nodes[control]!.position).toEqual(controlBefore)
    expect(editor.getState().selectedNodeIds).toEqual([first, second])

    editor.undo()
    expect(editor.getDoc().nodes[first]!.position).toEqual(firstBefore)
    expect(editor.getDoc().nodes[second]!.position).toEqual(secondBefore)
  })

  it('promotes a clicked member to primary without collapsing the group', () => {
    const { editor, first, second } = manualEditor()
    editor.setSelection([second, first])
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const firstNode = container.querySelector(
      `[data-node-id="${first}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(firstNode, { button: 0, clientX: 160, clientY: 110 })
    fireEvent.mouseUp(document, { button: 0, clientX: 160, clientY: 110 })

    expect(editor.getState().selectedNodeIds).toEqual([second, first])
    expect(editor.getState().selectedNodeId).toBe(first)
  })

  it('moves selected null-position nodes from their rendered origin', () => {
    const doc = createDoc('Null positions')
    const editor = new MindmapEditor(doc)
    const child = editor.addChild(doc.rootId)
    editor.setSelection([doc.rootId, child])
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const rootNode = container.querySelector(
      `[data-node-id="${doc.rootId}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(rootNode, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(document, {
      buttons: 1,
      clientX: 70,
      clientY: 50,
    })
    fireEvent.mouseUp(document, { button: 0, clientX: 70, clientY: 50 })

    expect(editor.getDoc().nodes[doc.rootId]!.position).toEqual({
      x: 60,
      y: 40,
    })
    expect(editor.getDoc().nodes[child]!.position).toEqual({ x: 60, y: 40 })
  })

  it('cancels a position preview and removes listeners when the window blurs', () => {
    const { editor, first, second } = manualEditor()
    editor.setSelection([first, second])
    const beforeFirst = { ...editor.getDoc().nodes[first]!.position! }
    const beforeSecond = { ...editor.getDoc().nodes[second]!.position! }
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const firstNode = container.querySelector(
      `[data-node-id="${first}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(firstNode, { button: 0, clientX: 160, clientY: 110 })
    fireEvent.mouseMove(document, { buttons: 1, clientX: 240, clientY: 150 })
    fireEvent.blur(window)
    fireEvent.mouseMove(document, { buttons: 0, clientX: 400, clientY: 300 })

    expect(editor.getDoc().nodes[first]!.position).toEqual(beforeFirst)
    expect(editor.getDoc().nodes[second]!.position).toEqual(beforeSecond)
  })

  it('does not let an idle second canvas cancel the first canvas preview', () => {
    const { editor, first, second } = manualEditor()
    editor.setSelection([first, second])
    const firstView = render(<Mindmap editor={editor} showOutline={false} />)
    const secondView = render(<Mindmap editor={editor} showOutline={false} />)
    const firstNode = firstView.container.querySelector(
      `[data-node-id="${first}"]`,
    ) as HTMLElement
    const before = { ...editor.getDoc().nodes[first]!.position! }

    fireEvent.mouseDown(firstNode, { button: 0, clientX: 160, clientY: 110 })
    fireEvent.mouseMove(document, { buttons: 1, clientX: 230, clientY: 150 })
    const preview = { ...editor.getDoc().nodes[first]!.position! }
    expect(preview).not.toEqual(before)

    secondView.unmount()
    expect(editor.getDoc().nodes[first]!.position).toEqual(preview)

    fireEvent.mouseUp(document, { button: 0, clientX: 230, clientY: 150 })
    expect(editor.getDoc().nodes[first]!.position).toEqual(preview)
    editor.undo()
    expect(editor.getDoc().nodes[first]!.position).toEqual(before)
  })

  it('dragging an unselected node replaces the previous group', () => {
    const { editor, root, first, second } = manualEditor()
    editor.setSelection([first, second])
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    const rootNode = container.querySelector(
      `[data-node-id="${root}"]`,
    ) as HTMLElement

    fireEvent.mouseDown(rootNode, { button: 0, clientX: 90, clientY: 30 })

    expect(editor.getState().selectedNodeIds).toEqual([root])
  })
})
