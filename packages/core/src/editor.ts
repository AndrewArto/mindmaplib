// MindmapEditor: the stateful controller (MML-B-0001 § Public API Surface).
//
// Holds the current doc, UI state (selection, editing, viewport), undo/redo
// ring buffer, and optional store connection. The React adapter binds to this
// exclusively. Undo/redo count as new document revisions (version increments).

import type {
  EditorState,
  LayoutMode,
  MindmapDoc,
  MindmapStore,
  NodeContent,
  SaveResult,
  Position,
  Transaction,
} from './types.js'
import { MindmapError } from './errors.js'
import { createId } from './id.js'
import {
  applyTransaction,
  buildTransaction,
  createAddNodeOp,
  createDeleteNodeOp,
  createMoveNodeOp,
  createResetManualPositionOp,
  createSetPositionOp,
  createToggleCollapsedOp,
  createUpdateContentOp,
} from './transactions.js'
import { computeLayoutOps } from './layout.js'

export interface MindmapEditorOptions {
  store?: MindmapStore
  undoLimit?: number
}

const DEFAULT_UNDO_LIMIT = 100

/**
 * Stateful mindmap editor: owns the document, UI state, undo/redo history,
 * and optional persistence.
 */
export class MindmapEditor {
  private doc: MindmapDoc
  private selectedNodeId: string | null = null
  private editingNodeId: string | null = null
  private viewport: { x: number; y: number; zoom: number } = {
    x: 0,
    y: 0,
    zoom: 1,
  }
  private layoutMode: LayoutMode = 'free-float'

  private undoStack: MindmapDoc[] = []
  private redoStack: MindmapDoc[] = []
  private readonly undoLimit: number
  private readonly store?: MindmapStore
  private lastSavedVersion: number
  private lastTransaction: Transaction | null = null
  private dragSnapshot: MindmapDoc | null = null

  private readonly listeners = new Set<(state: EditorState) => void>()

  constructor(initialDoc: MindmapDoc, options?: MindmapEditorOptions) {
    this.doc = initialDoc
    this.store = options?.store
    this.undoLimit = Math.max(0, options?.undoLimit ?? DEFAULT_UNDO_LIMIT)
    this.lastSavedVersion = initialDoc.version
  }

  // --- Document access -------------------------------------------------

  getDoc(): MindmapDoc {
    return this.doc
  }

  getLastTransaction(): Transaction | null {
    return this.lastTransaction
  }

  getState(): EditorState {
    return {
      doc: this.doc,
      selectedNodeId: this.selectedNodeId,
      editingNodeId: this.editingNodeId,
      viewport: { ...this.viewport },
      layoutMode: this.layoutMode,
    }
  }

  // --- Mutations -------------------------------------------------------

  apply(tx: Transaction, opts?: { strict?: boolean }): void {
    const next = applyTransaction(this.doc, tx, opts)
    this.pushUndo(this.doc)
    this.redoStack = []
    this.doc = next
    this.lastTransaction = tx
    this.notify()
  }

  addChild(
    parentId: string,
    opts?: { insertAfter?: string | null; content?: NodeContent },
  ): string {
    const nodeId = createId('node')
    this.apply(
      buildTransaction(this.doc, createAddNodeOp(parentId, nodeId, opts)),
    )
    return nodeId
  }

  addSibling(siblingId: string, content?: NodeContent): string {
    const sibling = this.doc.nodes[siblingId]
    if (!sibling) {
      throw new MindmapError(
        `addSibling: node ${siblingId} not found`,
        'NODE_NOT_FOUND',
        siblingId,
      )
    }
    if (sibling.parentId === null) {
      throw new MindmapError(
        'addSibling: cannot add a sibling of the root node',
        'ROOT_IMMUTABLE',
        siblingId,
      )
    }
    return this.addChild(sibling.parentId, { insertAfter: siblingId, content })
  }

  deleteNode(nodeId: string): void {
    this.apply(buildTransaction(this.doc, createDeleteNodeOp(nodeId)))
  }

  moveNode(
    nodeId: string,
    newParentId: string,
    insertAfter?: string | null,
  ): void {
    this.apply(
      buildTransaction(
        this.doc,
        createMoveNodeOp(nodeId, newParentId, insertAfter),
      ),
    )
  }

  promoteNode(nodeId: string): void {
    const node = this.doc.nodes[nodeId]
    if (!node) {
      throw new MindmapError(
        `promoteNode: node ${nodeId} not found`,
        'NODE_NOT_FOUND',
        nodeId,
      )
    }
    if (node.parentId === null) return // root: cannot promote
    const parent = this.doc.nodes[node.parentId]
    if (!parent || parent.parentId === null) return // parent is root: cannot promote above
    this.moveNode(nodeId, parent.parentId, parent.id)
  }

  updateContent(nodeId: string, content: NodeContent): void {
    this.apply(
      buildTransaction(this.doc, createUpdateContentOp(nodeId, content)),
    )
  }

  setPosition(nodeId: string, position: Position): void {
    // Backward-compatible alias for commitPosition (MML-B-0009 C2).
    this.commitPosition(nodeId, position)
  }

  /**
   * Update node position without creating an undo entry or incrementing the
   * document version. Used during drag: many updates, one undo entry on
   * commit. Call commitPosition when the drag ends.
   */
  setPositionDirect(nodeId: string, position: Position): void {
    if (this.dragSnapshot === null) {
      // Capture the pre-drag state on the first direct call.
      this.dragSnapshot = this.doc
    }
    const tx = buildTransaction(this.doc, createSetPositionOp(nodeId, position))
    const next = applyTransaction(this.doc, tx)
    // Revert version bump: direct updates don't create new revisions.
    this.doc = { ...next, version: this.doc.version }
    this.lastTransaction = tx
    this.notify()
  }

  /**
   * Commit the current document state as a single undo entry.
   * Captures the pre-drag state (saved by the first setPositionDirect call)
   * so undo reverts the entire drag in one step.
   */
  commitPosition(nodeId: string, position: Position): void {
    const snapshot = this.dragSnapshot ?? this.doc
    // Validate first: build + apply BEFORE mutating undo/redo state
    const tx = buildTransaction(this.doc, createSetPositionOp(nodeId, position))
    const next = applyTransaction(this.doc, tx) // throws if invalid
    this.pushUndo(snapshot)
    this.redoStack = []
    this.doc = next
    this.lastTransaction = tx
    this.dragSnapshot = null
    this.notify()
  }

  resetManualPosition(nodeId: string): void {
    this.apply(buildTransaction(this.doc, createResetManualPositionOp(nodeId)))
  }

  toggleCollapsed(nodeId: string): void {
    this.apply(buildTransaction(this.doc, createToggleCollapsedOp(nodeId)))
  }

  // --- Selection and editing ------------------------------------------

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId
    this.notify()
  }

  startEditing(nodeId: string): void {
    this.editingNodeId = nodeId
    this.notify()
  }

  stopEditing(): void {
    this.editingNodeId = null
    this.notify()
  }

  // --- Viewport --------------------------------------------------------

  setViewport(viewport: { x: number; y: number; zoom: number }): void {
    this.viewport = { ...viewport }
    this.notify()
  }

  /**
   * Compute a viewport that fits all positioned nodes (best-effort, PoC).
   * Pass container dimensions for correct zoom; omitting them falls back to
   * 800×600 (deprecated).
   */
  fitToScreen(containerWidth?: number, containerHeight?: number): void {
    const positioned = Object.values(this.doc.nodes).filter(
      (n) => n.position !== null,
    )
    if (positioned.length === 0) {
      this.setViewport({ x: 0, y: 0, zoom: 1 })
      return
    }
    const nodeW = 120
    const nodeH = 40
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of positioned) {
      const p = n.position!
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + nodeW)
      maxY = Math.max(maxY, p.y + nodeH)
    }
    const width = Math.max(maxX - minX, 1)
    const height = Math.max(maxY - minY, 1)
    const canvasW = containerWidth ?? 800
    const canvasH = containerHeight ?? 600
    const zoom = Math.min(canvasW / width, canvasH / height, 1)
    const x = (canvasW - width * zoom) / 2 - minX * zoom
    const y = (canvasH - height * zoom) / 2 - minY * zoom
    this.setViewport({ x, y, zoom })
  }

  // --- Layout ----------------------------------------------------------

  setLayout(mode: LayoutMode): void {
    this.layoutMode = mode
    const ops = computeLayoutOps(this.doc, mode)
    if (ops.length > 0) {
      this.apply(buildTransaction(this.doc, ops))
    } else {
      this.notify()
    }
  }

  // --- Undo / redo -----------------------------------------------------

  undo(): void {
    if (this.undoStack.length === 0) return
    this.redoStack.push(this.doc)
    const prev = this.undoStack.pop()!
    this.doc = this.bumpRevision(prev, this.doc.version)
    this.notify()
  }

  redo(): void {
    if (this.redoStack.length === 0) return
    this.undoStack.push(this.doc)
    const next = this.redoStack.pop()!
    this.doc = this.bumpRevision(next, this.doc.version)
    this.notify()
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // --- Store integration ----------------------------------------------

  isDirty(): boolean {
    return this.doc.version !== this.lastSavedVersion
  }

  async save(): Promise<SaveResult | undefined> {
    if (!this.store) return undefined
    const savingVersion = this.doc.version
    const result = await this.store.save(this.doc, {
      expectedVersion: this.lastSavedVersion,
    })
    if (result.saved) {
      this.lastSavedVersion = savingVersion
      return result
    }
    throw new Error(
      result.conflict
        ? `Save conflict: server is at version ${result.currentVersion ?? 'unknown'}`
        : 'Save failed',
    )
  }

  async load(docId: string): Promise<void> {
    if (!this.store) return
    const loaded = await this.store.load(docId)
    if (!loaded) return
    this.doc = loaded
    this.undoStack = []
    this.redoStack = []
    this.selectedNodeId = null
    this.editingNodeId = null
    this.lastSavedVersion = loaded.version
    this.notify()
  }

  // --- Subscription ----------------------------------------------------

  subscribe(listener: (state: EditorState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    this.listeners.clear()
  }

  // --- Internal --------------------------------------------------------

  private pushUndo(doc: MindmapDoc): void {
    this.undoStack.push(doc)
    while (this.undoStack.length > this.undoLimit) {
      this.undoStack.shift()
    }
  }

  /**
   * Produce a new doc snapshot with a version strictly greater than
   * `baseVersion` (the current live revision) and a refreshed meta.updated.
   * Undo/redo must never reuse or go below the live revision, otherwise
   * isDirty() and optimistic-concurrency checks break.
   */
  private bumpRevision(doc: MindmapDoc, baseVersion: number): MindmapDoc {
    return {
      ...doc,
      version: baseVersion + 1,
      meta: { ...doc.meta, updated: new Date().toISOString() },
    }
  }

  private notify(): void {
    // Clear stale selection/editing references before notifying subscribers.
    if (
      this.selectedNodeId !== null &&
      !Object.hasOwn(this.doc.nodes, this.selectedNodeId)
    ) {
      this.selectedNodeId = null
    }
    if (
      this.editingNodeId !== null &&
      !Object.hasOwn(this.doc.nodes, this.editingNodeId)
    ) {
      this.editingNodeId = null
    }
    const state = this.getState()
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}
