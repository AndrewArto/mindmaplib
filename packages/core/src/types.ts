// @mindmaplib/core type definitions.
//
// Framework-agnostic. No React, no DOM, no TipTap imports. The rich-text
// node content is modelled as a subset of the ProseMirror/TipTap JSON document
// format using our own TypeScript types (see MML-B-0001 § Node Content).

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A point in document (canvas) coordinate space. */
export interface Position {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Rich-text node content (subset of ProseMirror/TipTap JSON)
// ---------------------------------------------------------------------------

export interface NodeContentInline {
  type: 'text'
  text: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

/** Blocks that contain inline text directly. */
export interface TextBlock {
  type: 'paragraph' | 'heading' | 'codeBlock'
  attrs?: Record<string, unknown>
  content?: NodeContentInline[]
}

/** Blocks that contain nested list items. */
export interface ListBlock {
  type: 'bulletList' | 'orderedList'
  content: ListItemBlock[]
}

export interface ListItemBlock {
  type: 'listItem'
  // paragraphs + optional nested lists
  content: Array<TextBlock | ListBlock>
}

export type NodeContentBlock = TextBlock | ListBlock

export interface NodeContent {
  type: 'doc'
  content: NodeContentBlock[]
}

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

export interface MindmapNode {
  id: string
  parentId: string | null // null only for root
  position: Position | null // computed or explicit coordinates
  manualPosition: boolean // true = user-set, auto-layout must not override
  content: NodeContent // rich text (see Node Content section)
  collapsed: boolean // collapsed in outline and canvas
  childOrder: string[] // ordered list of child IDs; [] = leaf
}

export interface MindmapDoc {
  id: string
  rootId: string
  nodes: Record<string, MindmapNode>
  version: number // document revision, incremented on every transaction
  meta: {
    title: string
    created: string // ISO 8601
    updated: string // ISO 8601
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Serializable operation: plain JSON, no functions. A pure `applyOp` produces
 * a new doc from one of these.
 */
export type TransactionOp =
  | {
      type: 'addNode'
      parentId: string
      nodeId: string
      insertAfter?: string | null
      content?: NodeContent
    }
  | { type: 'deleteNode'; nodeId: string }
  | {
      type: 'moveNode'
      nodeId: string
      newParentId: string
      insertAfter?: string | null
    }
  | { type: 'updateContent'; nodeId: string; content: NodeContent }
  | { type: 'setPosition'; nodeId: string; position: Position }
  | { type: 'layoutPosition'; nodeId: string; position: Position }
  | { type: 'resetManualPosition'; nodeId: string }
  | { type: 'toggleCollapsed'; nodeId: string }

/**
 * A transaction bundles one or more ops applied atomically. `baseVersion`
 * enables optimistic concurrency.
 */
export interface Transaction {
  id: string // unique transaction ID (uuid or monotonic)
  baseVersion: number // doc.version this transaction was built against
  ops: TransactionOp[] // one or more ops applied in order
  timestamp: string // ISO 8601
  actorId?: string // reserved for future collaboration
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export type LayoutMode =
  'free-float' | 'tree-horizontal' | 'tree-vertical' | 'radial'

export interface EditorState {
  doc: MindmapDoc
  selectedNodeId: string | null // primary selected node in canvas
  selectedNodeIds: readonly string[] // ordered, unique selected node IDs
  editingNodeId: string | null // node with active editor
  viewport: { x: number; y: number; zoom: number } // pan/zoom transform
  layoutMode: LayoutMode
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface PositionUpdate {
  nodeId: string
  position: Position
}

export interface NodeMeasure {
  width: number
  height: number
}

/** nodeId -> measured DOM size. */
export type NodeMeasures = Record<string, NodeMeasure>

export interface LayoutOptions {
  nodeMeasures?: NodeMeasures // measured DOM sizes per node
  defaultNodeSize?: NodeMeasure // fallback when measure absent (default: 120x40)
  spacingX?: number // horizontal gap (default: 40)
  spacingY?: number // vertical gap (default: 20)
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Storage interface. The host implements persistence; core ships an in-memory
 * default for dev/testing.
 */
export interface MindmapStore {
  load(docId: string): Promise<MindmapDoc | null>
  save(
    doc: MindmapDoc,
    options?: { expectedVersion?: number },
  ): Promise<SaveResult>
  list(): Promise<MindmapDocMeta[]>
  delete(docId: string): Promise<void>
}

export interface SaveResult {
  saved: boolean
  conflict: boolean // true if expectedVersion mismatch (not thrown)
  currentVersion?: number // server-side version after save (if saved)
}

export interface MindmapDocMeta {
  id: string
  title: string
  updated: string
  version: number
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export interface SerializedDoc {
  schemaVersion: number // currently 1
  doc: MindmapDoc // the full document
}
