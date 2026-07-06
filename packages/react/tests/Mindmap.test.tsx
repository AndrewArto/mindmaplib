import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Mindmap } from '../src/Mindmap.js'
import { MindmapEditor, createDoc } from '@mindmaplib/core'

describe('Mindmap', () => {
  it('renders canvas and outline by default', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('.mml-canvas')).toBeTruthy()
    expect(container.querySelector('.mml-outline')).toBeTruthy()
  })

  it('hides outline when showOutline=false', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(
      <Mindmap editor={editor} showOutline={false} />,
    )
    expect(container.querySelector('.mml-canvas')).toBeTruthy()
    expect(container.querySelector('.mml-outline')).toBeNull()
  })

  it('renders root node content', () => {
    const doc = createDoc('Root Title')
    const editor = new MindmapEditor(doc)
    const { container } = render(<Mindmap editor={editor} />)
    expect(container.querySelector('[data-node-id]')).toBeTruthy()
  })

  it('applies custom className', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const { container } = render(
      <Mindmap editor={editor} className="custom-class" />,
    )
    expect(container.querySelector('.custom-class')).toBeTruthy()
  })

  it('calls onReady after mount', () => {
    const doc = createDoc('Test')
    const editor = new MindmapEditor(doc)
    const onReady = vi.fn()
    render(<Mindmap editor={editor} onReady={onReady} />)
    expect(onReady).toHaveBeenCalledWith(editor)
  })
})
