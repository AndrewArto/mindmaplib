// @mindmaplib/core — framework-agnostic mindmap engine.
//
// Public API surface per MML-B-0001. Implemented incrementally; modules are
// re-exported here as they land.

// --- Types ---
export type {
  Position,
  NodeContentInline,
  TextBlock,
  ListBlock,
  ListItemBlock,
  NodeContentBlock,
  NodeContent,
  MindmapNode,
  MindmapDoc,
  TransactionOp,
  Transaction,
  LayoutMode,
  EditorState,
  NodeMeasure,
  NodeMeasures,
  LayoutOptions,
  MindmapStore,
  SaveResult,
  MindmapDocMeta,
  SerializedDoc,
} from './types.js'

// --- Errors ---
export { MindmapError, VersionConflictError, StoreError } from './errors.js'
export type { MindmapErrorCode, StoreErrorCode } from './errors.js'

// --- Content helpers ---
export { emptyContent, normalizeContent } from './content.js'
export { MAX_LIST_DEPTH, MAX_TEXT_LENGTH } from './content.js'

// --- Document model ---
export {
  createDoc,
  getNode,
  getChildren,
  getDescendants,
  getPath,
  getAncestors,
  addNode,
  deleteNode,
  moveNode,
  updateNodeContent,
  setNodePosition,
  resetManualPosition,
  toggleNodeCollapsed,
} from './document.js'

// --- Transactions ---
export {
  createAddNodeOp,
  createDeleteNodeOp,
  createMoveNodeOp,
  createUpdateContentOp,
  createSetPositionOp,
  createLayoutPositionOp,
  createResetManualPositionOp,
  createToggleCollapsedOp,
  buildTransaction,
  applyOp,
  applyTransaction,
} from './transactions.js'
