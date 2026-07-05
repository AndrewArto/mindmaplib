// Canvas renderer: SVG edges + absolutely positioned HTML nodes, single transform.
// Two layers inside the viewport:
//   1. <svg> edges layer (Bézier curves)
//   2. <div> nodes layer (HTML elements)

import type { EditorState, MindmapDoc, MindmapNode } from '@mindmaplib/core'
import { getChildren } from '@mindmaplib/core'
import { contentToText } from './content'

const NODE_W = 120
const NODE_H = 40

export class Canvas {
  private readonly container: HTMLElement
  private readonly viewport: HTMLDivElement
  private readonly edgesSvg: SVGSVGElement
  private readonly edgesGroup: SVGGElement
  private readonly nodesLayer: HTMLDivElement

  private state: EditorState | null = null
  private readonly nodeEls = new Map<string, HTMLElement>()
  private panStart: { x: number; y: number; vx: number; vy: number } | null =
    null

  onSelectNode: ((id: string | null) => void) | null = null
  onEditNode: ((id: string) => void) | null = null
  onViewportChange:
    ((vp: { x: number; y: number; zoom: number }) => void) | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.viewport = document.createElement('div')
    this.viewport.className = 'canvas-viewport'

    this.edgesSvg = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    )
    this.edgesSvg.classList.add('canvas-edges')

    this.edgesGroup = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    )
    this.edgesSvg.appendChild(this.edgesGroup)

    this.nodesLayer = document.createElement('div')
    this.nodesLayer.className = 'canvas-nodes'

    this.viewport.appendChild(this.edgesSvg)
    this.viewport.appendChild(this.nodesLayer)
    container.appendChild(this.viewport)

    this.setupPanZoom()
  }

  render(state: EditorState): void {
    this.state = state
    this.applyTransform(state.viewport)
    this.renderEdges(state.doc)
    this.renderNodes(state)
  }

  // --- Transform ---

  private applyTransform(vp: { x: number; y: number; zoom: number }): void {
    this.viewport.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
    const rect = this.container.getBoundingClientRect()
    this.edgesSvg.setAttribute('width', String(rect.width))
    this.edgesSvg.setAttribute('height', String(rect.height))
    this.edgesSvg.style.transform = `translate(${-vp.x / vp.zoom}px, ${-vp.y / vp.zoom}px)`
    // Inverse-transform the svg so coordinates are in document space
    this.edgesGroup.setAttribute(
      'transform',
      `scale(${vp.zoom}) translate(${vp.x / vp.zoom}, ${vp.y / vp.zoom})`,
    )
  }

  // --- Edges ---

  private renderEdges(doc: MindmapDoc): void {
    this.edgesGroup.innerHTML = ''
    for (const node of Object.values(doc.nodes)) {
      if (node.parentId === null) continue
      const parent = doc.nodes[node.parentId]
      if (!parent || !parent.position || !node.position) continue
      this.drawEdge(parent, node)
    }
  }

  private drawEdge(parent: MindmapNode, child: MindmapNode): void {
    const px = parent.position!.x + NODE_W / 2
    const py = parent.position!.y + NODE_H / 2
    const cx = child.position!.x + NODE_W / 2
    const cy = child.position!.y + NODE_H / 2
    const midX = (px + cx) / 2
    const d = `M ${px} ${py} C ${midX} ${py}, ${midX} ${cy}, ${cx} ${cy}`
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.classList.add('edge')
    this.edgesGroup.appendChild(path)
  }

  // --- Nodes ---

  private renderNodes(state: EditorState): void {
    const { doc, selectedNodeId, editingNodeId } = state
    const liveIds = new Set<string>()

    for (const node of Object.values(doc.nodes)) {
      liveIds.add(node.id)
      if (!node.position) continue

      let el = this.nodeEls.get(node.id)
      const isEditing = node.id === editingNodeId
      const isSelected = node.id === selectedNodeId
      const isRoot = node.parentId === null

      if (!el) {
        el = document.createElement('div')
        el.className = 'mindmap-node'
        el.dataset.nodeId = node.id
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onSelectNode?.(node.id)
        })
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation()
          this.onEditNode?.(node.id)
        })
        this.nodesLayer.appendChild(el)
        this.nodeEls.set(node.id, el)
      }

      el.style.left = `${node.position.x}px`
      el.style.top = `${node.position.y}px`
      el.style.width = isRoot ? 'auto' : 'auto'
      el.className = 'mindmap-node'
      if (isRoot) el.classList.add('root')
      if (isSelected) el.classList.add('selected')
      if (isEditing) el.classList.add('editing')

      // Content: either text label or textarea
      const text = contentToText(node.content)
      if (isEditing) {
        if (!el.querySelector('textarea')) {
          el.innerHTML = ''
          const ta = document.createElement('textarea')
          ta.value = text
          ta.rows = 1
          ta.addEventListener('blur', () => {
            this.onEditNode?.('') // signal stop editing
          })
          ta.addEventListener('keydown', (e) => {
            e.stopPropagation()
            if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          })
          el.appendChild(ta)
          ta.focus()
          ta.select()
        }
      } else {
        el.textContent = text || (isRoot ? 'Root' : '...')
      }
    }

    // Remove stale node elements
    for (const [id, el] of this.nodeEls) {
      if (!liveIds.has(id)) {
        el.remove()
        this.nodeEls.delete(id)
      }
    }
  }

  // --- Pan / zoom ---

  private setupPanZoom(): void {
    let panning = false

    this.container.addEventListener('mousedown', (e) => {
      if (e.target instanceof HTMLElement) {
        if (e.target.closest('.mindmap-node')) return
        if (e.target.tagName === 'TEXTAREA') return
      }
      panning = true
      this.panStart = {
        x: e.clientX,
        y: e.clientY,
        vx: this.state?.viewport.x ?? 0,
        vy: this.state?.viewport.y ?? 0,
      }
      this.container.classList.add('panning')
    })

    window.addEventListener('mousemove', (e) => {
      if (!panning || !this.panStart || !this.state) return
      const vp = {
        x: this.panStart.vx + (e.clientX - this.panStart.x),
        y: this.panStart.vy + (e.clientY - this.panStart.y),
        zoom: this.state.viewport.zoom,
      }
      this.applyTransform(vp)
      this.onViewportChange?.(vp)
    })

    window.addEventListener('mouseup', () => {
      panning = false
      this.panStart = null
      this.container.classList.remove('panning')
    })

    // Click on empty canvas = deselect
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container || e.target === this.viewport) {
        this.onSelectNode?.(null)
      }
    })

    // Wheel zoom
    this.container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (!this.state) return
        const rect = this.container.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const oldZoom = this.state.viewport.zoom
        const delta = -e.deltaY * 0.001
        const newZoom = Math.min(Math.max(oldZoom * (1 + delta), 0.2), 3)

        // Zoom towards mouse position
        const vp = this.state.viewport
        const wx = (mx - vp.x) / oldZoom
        const wy = (my - vp.y) / oldZoom
        const nx = mx - wx * newZoom
        const ny = my - wy * newZoom

        const newVp = { x: nx, y: ny, zoom: newZoom }
        this.applyTransform(newVp)
        this.onViewportChange?.(newVp)
      },
      { passive: false },
    )
  }

  getEditingText(nodeId: string): string | null {
    const el = this.nodeEls.get(nodeId)
    if (!el) return null
    const ta = el.querySelector('textarea')
    return ta ? ta.value : null
  }

  destroy(): void {
    this.nodeEls.clear()
    this.container.innerHTML = ''
  }
}

export { NODE_W, NODE_H }
export function getVisibleNodes(
  doc: MindmapDoc,
  rootId: string,
): MindmapNode[] {
  const result: MindmapNode[] = []
  const visit = (id: string): void => {
    const node = doc.nodes[id]
    if (!node) return
    result.push(node)
    if (!node.collapsed) {
      for (const child of getChildren(doc, id)) {
        visit(child.id)
      }
    }
  }
  visit(rootId)
  return result
}
