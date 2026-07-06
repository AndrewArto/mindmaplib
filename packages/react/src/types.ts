// @mindmaplib/react — adapter-specific types.
//
// These extend the core types with React-specific concerns: component props,
// keyboard handlers, custom renderer contracts, and viewport constants.

import type { ReactNode, MouseEvent, RefObject } from 'react'
import type {
  LayoutMode,
  MindmapDoc,
  MindmapEditor,
  MindmapNode,
  Transaction,
} from '@mindmaplib/core'
import type { Extensions } from '@tiptap/core'

// ---------------------------------------------------------------------------
// Viewport constants
// ---------------------------------------------------------------------------

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4.0
export const ZOOM_WHEEL_FACTOR = 0.001
export const ZOOM_KEYBOARD_FACTOR = 1.2
export const DEFAULT_NODE_WIDTH = 120
export const DEFAULT_NODE_HEIGHT = 40
export const DEFAULT_OUTLINE_WIDTH = 280

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface MindmapProps {
  editor: MindmapEditor

  // Layout
  layoutMode?: LayoutMode
  selectToCenter?: boolean

  // Outline
  showOutline?: boolean
  outlineWidth?: number
  outlineShowToolbar?: boolean
  outlineSearchable?: boolean

  // Canvas
  showGrid?: boolean
  gridType?: 'dots' | 'lines' | 'none'

  // Rich text
  tiptapExtensions?: Extensions
  customNodeRenderer?: CustomNodeRenderer

  // Interaction
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean

  // Callbacks
  onChange?: (tx: Transaction, doc: MindmapDoc) => void
  onSelectionChange?: (nodeId: string | null) => void
  onSaveError?: (error: Error) => void
  onVersionConflict?: () => void
  onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void
  onReady?: (editor: MindmapEditor) => void

  // Styling
  className?: string
}

export interface CanvasViewProps {
  editor: MindmapEditor
  showGrid: boolean
  gridType: 'dots' | 'lines' | 'none'
  tiptapExtensions: Extensions
  customNodeRenderer?: CustomNodeRenderer
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean
  selectToCenter?: boolean
  exitEditModeRef: RefObject<(() => void) | null>
  onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void
}

export interface NodeViewProps {
  node: MindmapNode
  editor: MindmapEditor
  isSelected: boolean
  isEditing: boolean
  tiptapExtensions: Extensions
  customNodeRenderer?: CustomNodeRenderer
  exitEditModeRef: RefObject<(() => void) | null>
  onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void
}

export interface EdgeViewProps {
  parentId: string
  childId: string
  parentPosition: { x: number; y: number }
  childPosition: { x: number; y: number }
  parentMeasure: { width: number; height: number } | null
  childMeasure: { width: number; height: number } | null
  layoutMode: LayoutMode
  isSelected: boolean
}

export interface OutlineViewProps {
  editor: MindmapEditor
  selectedId: string | null
  showToolbar?: boolean
  searchable?: boolean
  selectToCenter?: boolean
  confirmDelete?: (node: MindmapNode) => Promise<boolean> | boolean
  onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void
  className?: string
}

export interface OutlineItemProps {
  node: MindmapNode
  depth: number
  isSelected: boolean
  isEditing: boolean
  isFocused: boolean
  isDraggable: boolean
  isDropTarget: boolean
  dropZone: 'before' | 'after' | 'inside' | null
  ariaLevel: number
  ariaPosInSet: number
  ariaSetSize: number
  ariaExpanded: boolean | undefined
  excerpt: string
  childCount: number
  searchMatch: boolean
  searchActive: boolean
  editor: MindmapEditor
  onSelect: (nodeId: string) => void
  onToggle: (nodeId: string) => void
  onEnter: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onEdit: (nodeId: string, event?: MouseEvent) => void
  onFocusItem: (nodeId: string) => void
  onDragStart: (
    e: { dataTransfer: { setData: (format: string, data: string) => void } },
    nodeId: string,
  ) => void
  onDragOver: (
    e: {
      preventDefault: () => void
      clientY: number
      currentTarget: HTMLElement
    },
    nodeId: string,
  ) => void
  onDragLeave: () => void
  onDrop: (
    e: {
      preventDefault: () => void
      dataTransfer: { getData: (format: string) => string }
    },
    nodeId: string,
  ) => void
}

// ---------------------------------------------------------------------------
// Custom node renderer
// ---------------------------------------------------------------------------

export interface CustomNodeRendererProps {
  node: MindmapNode
  editor: MindmapEditor
  isEditing: boolean
  html: string
}

export type CustomNodeRenderer = (props: CustomNodeRendererProps) => ReactNode

// ---------------------------------------------------------------------------
// Keyboard handlers
// ---------------------------------------------------------------------------

export interface KeyboardHandlers {
  onKeyDown: (e: import('react').KeyboardEvent<HTMLElement>) => void
}
