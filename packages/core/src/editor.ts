// MindmapEditor: the stateful controller (MML-B-0001 § Public API Surface).
//
// Holds the current doc, UI state (selection, editing, viewport), undo/redo
// ring buffer, and optional store connection. The React adapter binds to this
// exclusively. Undo/redo count as new document revisions (version increments).

import type {
  EditorState,
  LayoutMode,
  MindmapDoc,
  MindmapNode,
  MindmapStore,
  NodeContent,
  SaveResult,
  Position,
  PositionUpdate,
  Transaction,
  NodeMeasures,
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
  applyOp,
} from './transactions.js'
import { computeLayoutOps } from './layout.js'
import { normalizeContent } from './content.js'

export interface MindmapEditorOptions {
  store?: MindmapStore
  undoLimit?: number
}

export interface SetLayoutOptions {
  /** Reset user-dragged anchors before applying an explicit auto-layout. */
  resetManualPositions?: boolean
}

const DEFAULT_UNDO_LIMIT = 100
const DEFAULT_FIT_MAX_ZOOM = 4
const DEFAULT_FIT_PADDING = 24
const DEFAULT_FIT_NODE_SIZE = { width: 120, height: 40 }

/**
 * Stateful mindmap editor: owns the document, UI state, undo/redo history,
 * and optional persistence.
 */
export class MindmapEditor {
  private doc: MindmapDoc
  private selectedNodeId: string | null = null
  private selectedNodeIds: string[] = []
  private editingNodeId: string | null = null
  private viewport: { x: number; y: number; zoom: number } = {
    x: 0,
    y: 0,
    zoom: 1,
  }
  private layoutMode: LayoutMode = 'free-float'
  private nodeMeasures: NodeMeasures = {}

  private undoStack: MindmapDoc[] = []
  private redoStack: MindmapDoc[] = []
  private readonly undoLimit: number
  private readonly store?: MindmapStore
  private lastSavedVersion: number
  private lastTransaction: Transaction | null = null
  private mergeNextLayoutWithStructuralHistory = false
  private positionPreview: {
    id: number
    snapshot: MindmapDoc
    nodeIds: string[]
    lastTransaction: Transaction | null
    mergeNextLayoutWithStructuralHistory: boolean
  } | null = null
  private nextPositionPreviewId = 1

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
      selectedNodeIds: [...this.selectedNodeIds],
      editingNodeId: this.editingNodeId,
      viewport: { ...this.viewport },
      layoutMode: this.layoutMode,
    }
  }

  // --- Mutations -------------------------------------------------------

  apply(tx: Transaction, opts?: { strict?: boolean }): void {
    const committedDoc = this.positionPreview?.snapshot ?? this.doc
    const next = applyTransaction(committedDoc, tx, opts)
    this.positionPreview = null
    this.pushUndo(committedDoc)
    this.redoStack = []
    this.doc = next
    this.lastTransaction = tx
    this.mergeNextLayoutWithStructuralHistory = tx.ops.every(
      (op) => op.type === 'addNode' || op.type === 'moveNode',
    )
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
    const node = this.doc.nodes[nodeId]
    if (!node) {
      throw new MindmapError(
        `updateContent: node ${nodeId} not found`,
        'NODE_NOT_FOUND',
        nodeId,
      )
    }
    const normalized = normalizeContent(content)
    if (JSON.stringify(node.content) === JSON.stringify(normalized)) return
    this.apply(
      buildTransaction(this.doc, createUpdateContentOp(nodeId, normalized)),
    )
  }

  setPosition(nodeId: string, position: Position): void {
    // Backward-compatible alias for commitPosition (MML-B-0009 C2).
    this.commitPosition(nodeId, position)
  }

  /**
   * Preview one or more node positions atomically without an undo entry or
   * revision increment. Returns a token that guards subsequent preview and
   * commit calls against stale or interleaved interactions.
   */
  setPositionsDirect(
    updates: readonly PositionUpdate[],
    previewId?: number,
  ): number {
    if (updates.length === 0) {
      if (previewId !== undefined && this.positionPreview?.id !== previewId) {
        throw new MindmapError(
          'Position preview is stale',
          'INVALID_TRANSACTION',
        )
      }
      return this.positionPreview?.id ?? 0
    }
    const nodeIds = this.validatePositionUpdateBatch(updates)
    const activePreview = this.positionPreview
    if (activePreview) {
      if (previewId !== undefined && previewId !== activePreview.id) {
        throw new MindmapError(
          'Position preview is stale',
          'INVALID_TRANSACTION',
        )
      }
      if (!this.sameNodeIds(activePreview.nodeIds, nodeIds)) {
        throw new MindmapError(
          'Position preview node set changed during drag',
          'INVALID_TRANSACTION',
        )
      }
      if (
        this.doc.id !== activePreview.snapshot.id ||
        this.doc.version !== activePreview.snapshot.version
      ) {
        this.discardPositionPreview(false)
        throw new MindmapError(
          'Position preview is stale',
          'INVALID_TRANSACTION',
        )
      }
    } else if (previewId !== undefined) {
      throw new MindmapError('Position preview is stale', 'INVALID_TRANSACTION')
    }

    const tx = buildTransaction(
      this.doc,
      updates.map(({ nodeId, position }) =>
        createSetPositionOp(nodeId, position),
      ),
    )
    const beforePreview = this.doc
    const previousLastTransaction = this.lastTransaction
    const previousMergeFlag = this.mergeNextLayoutWithStructuralHistory
    const next = applyTransaction(this.doc, tx)
    if (!this.positionPreview) {
      this.positionPreview = {
        id: this.nextPositionPreviewId++,
        snapshot: beforePreview,
        nodeIds,
        lastTransaction: previousLastTransaction,
        mergeNextLayoutWithStructuralHistory: previousMergeFlag,
      }
    }
    this.doc = { ...next, version: this.positionPreview.snapshot.version }
    this.lastTransaction = tx
    this.mergeNextLayoutWithStructuralHistory = false
    this.notify()
    return this.positionPreview.id
  }

  setPositionDirect(nodeId: string, position: Position): void {
    this.setPositionsDirect([{ nodeId, position }])
  }

  /** Commit a position batch as one transaction and one undo entry. */
  commitPositions(
    updates: readonly PositionUpdate[],
    previewId?: number,
  ): void {
    if (updates.length === 0) {
      this.cancelPositionPreview(previewId)
      return
    }
    const nodeIds = this.validatePositionUpdateBatch(updates)
    const activePreview = this.positionPreview
    if (activePreview) {
      if (previewId !== undefined && previewId !== activePreview.id) {
        throw new MindmapError(
          'Position preview is stale',
          'INVALID_TRANSACTION',
        )
      }
      if (!this.sameNodeIds(activePreview.nodeIds, nodeIds)) {
        throw new MindmapError(
          'Committed position batch must match the active preview',
          'INVALID_TRANSACTION',
        )
      }
      if (
        this.doc.id !== activePreview.snapshot.id ||
        this.doc.version !== activePreview.snapshot.version
      ) {
        this.discardPositionPreview(false)
        throw new MindmapError(
          'Position preview is stale',
          'INVALID_TRANSACTION',
        )
      }
    } else if (previewId !== undefined) {
      throw new MindmapError('Position preview is stale', 'INVALID_TRANSACTION')
    }

    const snapshot = activePreview?.snapshot ?? this.doc
    const tx = buildTransaction(
      this.doc,
      updates.map(({ nodeId, position }) =>
        createSetPositionOp(nodeId, position),
      ),
    )
    const next = applyTransaction(this.doc, tx)
    this.pushUndo(snapshot)
    this.redoStack = []
    this.doc = next
    this.lastTransaction = tx
    this.mergeNextLayoutWithStructuralHistory = false
    this.positionPreview = null
    this.notify()
  }

  commitPosition(nodeId: string, position: Position): void {
    this.commitPositions([{ nodeId, position }])
  }

  cancelPositionPreview(previewId?: number): void {
    if (!this.positionPreview) return
    if (previewId !== undefined && previewId !== this.positionPreview.id) return
    this.discardPositionPreview(true)
  }

  resetManualPosition(nodeId: string): void {
    this.apply(buildTransaction(this.doc, createResetManualPositionOp(nodeId)))
  }

  toggleCollapsed(nodeId: string): void {
    this.apply(buildTransaction(this.doc, createToggleCollapsedOp(nodeId)))
  }

  // --- Selection and editing ------------------------------------------

  setSelection(
    nodeIds: readonly string[],
    primaryNodeId?: string | null,
  ): void {
    const seen = new Set<string>()
    this.selectedNodeIds = nodeIds.filter((nodeId) => {
      if (seen.has(nodeId) || !Object.hasOwn(this.doc.nodes, nodeId))
        return false
      seen.add(nodeId)
      return true
    })
    this.selectedNodeId =
      primaryNodeId && this.selectedNodeIds.includes(primaryNodeId)
        ? primaryNodeId
        : (this.selectedNodeIds[0] ?? null)
    this.notify()
  }

  select(nodeId: string | null): void {
    this.setSelection(nodeId === null ? [] : [nodeId])
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
    const positioned: MindmapNode[] = []
    const visitVisible = (nodeId: string): void => {
      const node = this.doc.nodes[nodeId]
      if (!node) return
      if (node.position !== null) positioned.push(node)
      if (node.collapsed) return
      for (const childId of node.childOrder) {
        visitVisible(childId)
      }
    }
    visitVisible(this.doc.rootId)
    if (positioned.length === 0) {
      this.setViewport({ x: 0, y: 0, zoom: 1 })
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of positioned) {
      const p = n.position!
      const measure = this.nodeMeasures[n.id] ?? DEFAULT_FIT_NODE_SIZE
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + measure.width)
      maxY = Math.max(maxY, p.y + measure.height)
    }
    const width = Math.max(maxX - minX, 1)
    const height = Math.max(maxY - minY, 1)
    const canvasW = Math.max(containerWidth ?? 800, 1)
    const canvasH = Math.max(containerHeight ?? 600, 1)
    const hasRealContainer =
      containerWidth !== undefined && containerHeight !== undefined
    const maxZoom = hasRealContainer ? DEFAULT_FIT_MAX_ZOOM : 1
    const padding = hasRealContainer
      ? Math.min(
          DEFAULT_FIT_PADDING,
          Math.max((canvasW - 1) / 2, 0),
          Math.max((canvasH - 1) / 2, 0),
        )
      : 0
    const availableW = Math.max(canvasW - padding * 2, 1)
    const availableH = Math.max(canvasH - padding * 2, 1)
    const zoom = Math.min(availableW / width, availableH / height, maxZoom)
    const x = padding + (availableW - width * zoom) / 2 - minX * zoom
    const y = padding + (availableH - height * zoom) / 2 - minY * zoom
    this.setViewport({ x, y, zoom })
  }

  // --- Layout ----------------------------------------------------------

  setLayout(mode: LayoutMode, options?: SetLayoutOptions): void {
    this.discardPositionPreview(false)
    const resetManualPositions =
      mode !== 'free-float' && (options?.resetManualPositions ?? false)
    const mergeWithPreviousStructuralChange =
      !resetManualPositions &&
      this.layoutMode === mode &&
      this.mergeNextLayoutWithStructuralHistory
    this.mergeNextLayoutWithStructuralHistory = false
    this.layoutMode = mode

    const resetOps: Transaction['ops'] = []
    if (resetManualPositions) {
      const visitVisible = (nodeId: string): void => {
        const node = this.doc.nodes[nodeId]
        if (!node) return
        if (node.manualPosition) {
          resetOps.push(createResetManualPositionOp(node.id))
        }
        if (node.collapsed) return
        for (const childId of node.childOrder) visitVisible(childId)
      }
      visitVisible(this.doc.rootId)
    }
    let docForLayout = this.doc
    for (const op of resetOps) {
      docForLayout = applyOp(docForLayout, op)
    }
    const layoutOps = computeLayoutOps(docForLayout, mode, {
      nodeMeasures: this.nodeMeasures,
    })
    const ops = [...resetOps, ...layoutOps]

    if (ops.length > 0) {
      const tx = buildTransaction(this.doc, ops)
      if (mergeWithPreviousStructuralChange) {
        this.doc = applyTransaction(this.doc, tx)
        this.redoStack = []
        this.lastTransaction = tx
        this.notify()
      } else {
        this.apply(tx)
      }
    } else {
      this.notify()
    }
  }

  /**
   * Store measured node sizes and trigger relayout if in auto-layout mode.
   * Called by the React adapter's ResizeObserver pipeline.
   *
   * Stale entries (nodes no longer in the doc) are pruned so deleted nodes
   * don't skew the max-size calculation. The relayout is applied silently
   * (no undo entry, no version bump) because it's a background measurement
   * update, not a user action.
   */
  setNodeMeasures(measures: NodeMeasures): void {
    // P2 r1: Prune stale measures for nodes not in current doc
    const filtered: NodeMeasures = {}
    for (const [id, m] of Object.entries(measures)) {
      if (this.doc.nodes[id]) filtered[id] = m
    }
    const prev = this.nodeMeasures
    this.nodeMeasures = filtered
    if (this.positionPreview || this.layoutMode === 'free-float') return
    // Skip relayout if effective max dimensions are unchanged
    const prevVals = Object.values(prev)
    const newVals = Object.values(filtered)
    if (prevVals.length > 0 && newVals.length > 0) {
      const prevMaxW = Math.max(...prevVals.map((m) => m.width))
      const prevMaxH = Math.max(...prevVals.map((m) => m.height))
      const newMaxW = Math.max(...newVals.map((m) => m.width))
      const newMaxH = Math.max(...newVals.map((m) => m.height))
      if (prevMaxW === newMaxW && prevMaxH === newMaxH) return
    }
    // P2 r1: Silent relayout — no undo entry, no version bump
    const ops = computeLayoutOps(this.doc, this.layoutMode, {
      nodeMeasures: this.nodeMeasures,
    })
    if (ops.length > 0) {
      let next = this.doc
      for (const op of ops) {
        next = applyOp(next, op)
      }
      this.doc = next
      this.mergeNextLayoutWithStructuralHistory = false
      this.notify()
    }
  }

  getNodeMeasures(): NodeMeasures {
    return this.nodeMeasures
  }

  // --- Undo / redo -----------------------------------------------------

  undo(): void {
    const discardedPreview = this.positionPreview !== null
    this.discardPositionPreview(false)
    if (this.undoStack.length === 0) {
      if (discardedPreview) this.notify()
      return
    }
    this.mergeNextLayoutWithStructuralHistory = false
    this.redoStack.push(this.doc)
    const prev = this.undoStack.pop()!
    this.doc = this.bumpRevision(prev, this.doc.version)
    this.notify()
  }

  redo(): void {
    const discardedPreview = this.positionPreview !== null
    this.discardPositionPreview(false)
    if (this.redoStack.length === 0) {
      if (discardedPreview) this.notify()
      return
    }
    this.mergeNextLayoutWithStructuralHistory = false
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

  /**
   * Mark the current document revision as clean after the host has persisted it
   * outside the editor's save() call path.
   */
  markSaved(version = this.doc.version): void {
    if (version !== this.doc.version) {
      throw new Error(
        `Cannot mark version ${version} saved while the current document is version ${this.doc.version}`,
      )
    }
    this.lastSavedVersion = version
  }

  async save(): Promise<SaveResult | undefined> {
    if (!this.store) return undefined
    if (this.positionPreview) {
      throw new Error('Cannot save while a position preview is active')
    }
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
    this.selectedNodeIds = []
    this.editingNodeId = null
    this.lastSavedVersion = loaded.version
    this.lastTransaction = null
    this.mergeNextLayoutWithStructuralHistory = false
    this.positionPreview = null
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

  private validatePositionUpdateBatch(
    updates: readonly PositionUpdate[],
  ): string[] {
    const seen = new Set<string>()
    for (const update of updates) {
      if (seen.has(update.nodeId)) {
        throw new MindmapError(
          `Duplicate position update for node ${update.nodeId}`,
          'INVALID_TRANSACTION',
          update.nodeId,
        )
      }
      seen.add(update.nodeId)
    }
    return [...seen]
  }

  private sameNodeIds(
    left: readonly string[],
    right: readonly string[],
  ): boolean {
    return (
      left.length === right.length &&
      left.every((nodeId, index) => nodeId === right[index])
    )
  }

  private discardPositionPreview(notify: boolean): void {
    const preview = this.positionPreview
    if (!preview) return
    this.doc = preview.snapshot
    this.lastTransaction = preview.lastTransaction
    this.mergeNextLayoutWithStructuralHistory =
      preview.mergeNextLayoutWithStructuralHistory
    this.positionPreview = null
    if (notify) this.notify()
  }

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
    this.selectedNodeIds = this.selectedNodeIds.filter((nodeId) =>
      Object.hasOwn(this.doc.nodes, nodeId),
    )
    if (
      this.selectedNodeId === null ||
      !this.selectedNodeIds.includes(this.selectedNodeId)
    ) {
      this.selectedNodeId = this.selectedNodeIds[0] ?? null
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
