// OutlineView: the hierarchical outline panel.
//
// Single subscription to MindmapEditor via useEditor. Builds flat visible list
// via depth-first traversal respecting collapsed flags + ephemeral expansion set.
// Supports search/filter, keyboard navigation (roving tabindex), drag-and-drop
// reparenting, collapse/expand, auto-expand ancestors on selection.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  getNode,
  getChildren,
  getPath,
  createToggleCollapsedOp,
  buildTransaction,
} from '@mindmaplib/core'
import type { MindmapDoc } from '@mindmaplib/core'
import { useEditor } from './hooks/useEditor.js'
import { textExcerpt, fullPlainText } from './content.js'
import { OutlineItem } from './OutlineItem.js'
import type { OutlineViewProps } from './types.js'

// --- Tree traversal helpers ---

function buildVisibleList(
  doc: MindmapDoc,
  ephemeralExpand: Set<string>,
): string[] {
  const result: string[] = []
  const walk = (nodeId: string) => {
    result.push(nodeId)
    const node = getNode(doc, nodeId)
    if (!node) return
    const effectivelyExpanded = !node.collapsed || ephemeralExpand.has(nodeId)
    if (!effectivelyExpanded) return
    for (const childId of node.childOrder) walk(childId)
  }
  if (doc.rootId) walk(doc.rootId)
  return result
}

function buildFilteredList(doc: MindmapDoc, query: string): string[] {
  const q = query.toLowerCase()
  const matching = new Set<string>()
  const ancestors = new Set<string>()

  const walk = (nodeId: string): boolean => {
    const node = getNode(doc, nodeId)
    if (!node) return false
    const text = fullPlainText(node.content).toLowerCase()
    const isMatch = q === '' || text.includes(q)
    let descendantMatch = false
    for (const childId of node.childOrder) {
      if (walk(childId)) descendantMatch = true
    }
    if (isMatch || descendantMatch) {
      matching.add(nodeId)
      if (descendantMatch) ancestors.add(nodeId)
      return true
    }
    return false
  }
  if (doc.rootId) walk(doc.rootId)

  // Build flat list including matches + ancestors, respecting childOrder
  const result: string[] = []
  const walkResult = (nodeId: string) => {
    if (!matching.has(nodeId)) return
    result.push(nodeId)
    const node = getNode(doc, nodeId)
    if (!node) return
    for (const childId of node.childOrder) walkResult(childId)
  }
  if (doc.rootId) walkResult(doc.rootId)
  return result
}

function isDescendant(
  doc: MindmapDoc,
  ancestorId: string,
  nodeId: string,
): boolean {
  let current: string | null = nodeId
  while (current !== null) {
    if (current === ancestorId) return true
    const node = getNode(doc, current)
    if (!node) return false
    current = node.parentId
  }
  return false
}

function getPosInSet(doc: MindmapDoc, nodeId: string): number {
  const node = getNode(doc, nodeId)
  if (!node || !node.parentId) return 1
  const siblings = getChildren(doc, node.parentId)
  return siblings.findIndex((s) => s.id === nodeId) + 1
}

function getSetSize(doc: MindmapDoc, nodeId: string): number {
  const node = getNode(doc, nodeId)
  if (!node || !node.parentId) return 1
  return getChildren(doc, node.parentId).length
}

function getPrevSibling(doc: MindmapDoc, nodeId: string): string | null {
  const node = getNode(doc, nodeId)
  if (!node || !node.parentId) return null
  const siblings = getChildren(doc, node.parentId)
  const idx = siblings.findIndex((s) => s.id === nodeId)
  return idx > 0 ? siblings[idx - 1].id : null
}

function navigateVisible(
  visibleIds: string[],
  currentId: string,
  direction: 'next' | 'prev',
): string | null {
  const idx = visibleIds.indexOf(currentId)
  if (idx === -1) return visibleIds[0] ?? null
  const nextIdx = direction === 'next' ? idx + 1 : idx - 1
  if (nextIdx < 0 || nextIdx >= visibleIds.length) return null
  return visibleIds[nextIdx]
}

function ensureVisible(doc: MindmapDoc, nodeId: string): Set<string> {
  const next = new Set<string>()
  let parentId = getNode(doc, nodeId)?.parentId ?? null
  while (parentId !== null) {
    const parent = getNode(doc, parentId)
    if (!parent) break
    if (parent.collapsed) next.add(parentId)
    parentId = parent.parentId
  }
  return next
}

// --- Component ---

function OutlineViewComponent({
  editor,
  selectedId,
  showToolbar = false,
  searchable = false,
  confirmDelete,
  className,
}: OutlineViewProps): React.ReactElement {
  const state = useEditor(editor)
  const { doc } = state

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [ephemeralExpand, setEphemeralExpand] = useState<Set<string>>(new Set())
  const draggedIdRef = useRef<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<
    'before' | 'after' | 'inside' | null
  >(null)

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const searchActive = searchQuery.length > 0

  // Auto-expand ancestors when selection changes
  useEffect(() => {
    if (selectedId) {
      setEphemeralExpand(ensureVisible(doc, selectedId))
    }
  }, [selectedId, doc])

  // Build visible list
  const visibleIds = useMemo(() => {
    if (searchActive) {
      return buildFilteredList(doc, searchQuery)
    }
    return buildVisibleList(doc, ephemeralExpand)
  }, [doc, ephemeralExpand, searchActive, searchQuery])

  // Compute filtered visible set for aria-expanded during search
  const filteredVisibleIds = useMemo(() => {
    if (!searchActive) return new Set<string>()
    return new Set(buildFilteredList(doc, searchQuery))
  }, [doc, searchQuery, searchActive])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedItemId) {
      const el = itemRefs.current.get(focusedItemId)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedItemId])

  // --- Keyboard navigation ---

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentId = focusedItemId ?? visibleIds[0] ?? null
      if (!currentId) return

      const node = getNode(doc, currentId)
      if (!node) return

      switch (e.key) {
        case 'ArrowDown': {
          const next = navigateVisible(visibleIds, currentId, 'next')
          if (next) setFocusedItemId(next)
          e.preventDefault()
          break
        }
        case 'ArrowUp': {
          const prev = navigateVisible(visibleIds, currentId, 'prev')
          if (prev) setFocusedItemId(prev)
          e.preventDefault()
          break
        }
        case 'ArrowRight': {
          if (!searchActive) {
            const hasChildren = node.childOrder.length > 0
            const isExpanded = !node.collapsed || ephemeralExpand.has(node.id)
            if (hasChildren && !isExpanded) {
              editor.toggleCollapsed(node.id)
            } else if (hasChildren && isExpanded) {
              // Move to first child
              const firstChild = node.childOrder[0]
              if (firstChild) setFocusedItemId(firstChild)
            }
          } else {
            const next = navigateVisible(visibleIds, currentId, 'next')
            if (next) setFocusedItemId(next)
          }
          e.preventDefault()
          break
        }
        case 'ArrowLeft': {
          if (!searchActive) {
            const hasChildren = node.childOrder.length > 0
            const isExpanded = !node.collapsed || ephemeralExpand.has(node.id)
            if (hasChildren && isExpanded) {
              editor.toggleCollapsed(node.id)
            } else if (node.parentId) {
              setFocusedItemId(node.parentId)
            }
          } else {
            const prev = navigateVisible(visibleIds, currentId, 'prev')
            if (prev) setFocusedItemId(prev)
          }
          e.preventDefault()
          break
        }
        case 'Home': {
          if (visibleIds.length > 0) setFocusedItemId(visibleIds[0])
          e.preventDefault()
          break
        }
        case 'End': {
          if (visibleIds.length > 0)
            setFocusedItemId(visibleIds[visibleIds.length - 1])
          e.preventDefault()
          break
        }
        case 'Enter': {
          editor.select(node.id)
          e.preventDefault()
          break
        }
        case ' ': {
          editor.select(node.id)
          e.preventDefault()
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (node.parentId !== null) {
            const doDelete = () => {
              editor.deleteNode(node.id)
            }
            if (node.childOrder.length > 0) {
              const shouldDelete = confirmDelete
                ? confirmDelete(node)
                : typeof window !== 'undefined' &&
                  window.confirm(`Delete "${node.id}" and its subtree?`)
              if (shouldDelete) doDelete()
            } else {
              doDelete()
            }
          }
          e.preventDefault()
          break
        }
        case 'F2': {
          editor.select(node.id)
          editor.startEditing(node.id)
          e.preventDefault()
          break
        }
        case 'Escape': {
          editor.select(null)
          e.preventDefault()
          break
        }
      }
    },
    [
      focusedItemId,
      visibleIds,
      doc,
      editor,
      searchActive,
      ephemeralExpand,
      confirmDelete,
    ],
  )

  // --- Handlers ---

  const handleToggle = useCallback(
    (nodeId: string) => {
      const node = getNode(doc, nodeId)
      if (!node || node.childOrder.length === 0) return
      if (ephemeralExpand.has(nodeId)) {
        if (node.collapsed) editor.toggleCollapsed(nodeId)
        setEphemeralExpand((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      } else {
        editor.toggleCollapsed(nodeId)
      }
    },
    [doc, editor, ephemeralExpand],
  )

  const handleDragStart = useCallback(
    (
      e: { dataTransfer: { setData: (format: string, data: string) => void } },
      nodeId: string,
    ) => {
      const node = getNode(doc, nodeId)
      if (!node || node.parentId === null) {
        e.dataTransfer.setData('text/plain', '')
        return
      }
      draggedIdRef.current = nodeId
      e.dataTransfer.setData('text/plain', nodeId)
    },
    [doc],
  )

  const getDropZone = useCallback(
    (
      clientY: number,
      targetEl: HTMLElement,
      targetId: string,
    ): 'before' | 'after' | 'inside' | null => {
      if (!draggedIdRef.current || draggedIdRef.current === targetId)
        return null
      const target = getNode(doc, targetId)
      if (!target) return null
      // Reject drops onto own descendants (prevents cycles)
      if (isDescendant(doc, targetId, draggedIdRef.current!)) return null
      const isRoot = target.parentId === null
      const rect = targetEl.getBoundingClientRect()
      const y = clientY - rect.top
      const h = rect.height
      const raw = y < h * 0.25 ? 'before' : y > h * 0.75 ? 'after' : 'inside'
      if (isRoot && raw !== 'inside') return null
      return raw
    },
    [doc],
  )

  const handleDragOver = useCallback(
    (
      e: {
        preventDefault: () => void
        clientY: number
        currentTarget: HTMLElement
      },
      nodeId: string,
    ) => {
      const zone = getDropZone(e.clientY, e.currentTarget, nodeId)
      if (zone === null) return
      e.preventDefault()
      setDropTargetId(nodeId)
      setDropZone(zone)
    },
    [getDropZone],
  )

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
    setDropZone(null)
  }, [])

  const handleDrop = useCallback(
    (
      e: {
        preventDefault: () => void
        dataTransfer: { getData: (format: string) => string }
      },
      nodeId: string,
    ) => {
      e.preventDefault()
      const draggedIdStr =
        e.dataTransfer.getData('text/plain') || draggedIdRef.current
      if (!draggedIdStr || draggedIdStr === nodeId) {
        draggedIdRef.current = null
        setDropTargetId(null)
        setDropZone(null)
        return
      }
      const effectiveZone = dropZone
      if (effectiveZone === null) {
        draggedIdRef.current = null
        setDropTargetId(null)
        setDropZone(null)
        return
      }

      const target = getNode(doc, nodeId)
      if (!target) return

      if (effectiveZone === 'inside') {
        editor.moveNode(draggedIdStr, nodeId, null)
      } else {
        const parentId = target.parentId
        if (!parentId) return
        const insertAfter =
          effectiveZone === 'before' ? getPrevSibling(doc, nodeId) : nodeId
        editor.moveNode(draggedIdStr, parentId, insertAfter)
      }
      draggedIdRef.current = null
      setDropTargetId(null)
      setDropZone(null)
    },
    [doc, editor, dropZone],
  )

  // Collapse/Expand all
  const handleCollapseAll = useCallback(() => {
    const d = editor.getDoc()
    const ops = Object.values(d.nodes)
      .filter((n) => !n.collapsed && n.childOrder.length > 0)
      .map((n) => createToggleCollapsedOp(n.id))
    if (ops.length > 0) editor.apply(buildTransaction(d, ops))
    setEphemeralExpand(new Set())
  }, [editor])

  const handleExpandAll = useCallback(() => {
    const d = editor.getDoc()
    const ops = Object.values(d.nodes)
      .filter((n) => n.collapsed)
      .map((n) => createToggleCollapsedOp(n.id))
    if (ops.length > 0) editor.apply(buildTransaction(d, ops))
  }, [editor])

  // Render flat list
  const items = useMemo(() => {
    return visibleIds.map((id) => {
      const node = getNode(doc, id)
      if (!node) return null
      const path = getPath(doc, id)
      const depth = path.length - 1
      const isRoot = node.parentId === null
      const hasChildren = node.childOrder.length > 0
      const isExpanded = searchActive
        ? hasChildren &&
          node.childOrder.some((cid) => filteredVisibleIds.has(cid))
        : hasChildren && (!node.collapsed || ephemeralExpand.has(node.id))
      const excerpt = textExcerpt(node.content)
      const childCount = node.childOrder.length
      const text = searchActive ? fullPlainText(node.content).toLowerCase() : ''
      const isMatch = searchActive && text.includes(searchQuery.toLowerCase())

      return (
        <OutlineItem
          key={id}
          node={node}
          depth={depth}
          isSelected={id === selectedId}
          isEditing={id === state.editingNodeId}
          isFocused={id === focusedItemId}
          isDraggable={!isRoot}
          isDropTarget={id === dropTargetId}
          dropZone={id === dropTargetId ? dropZone : null}
          ariaLevel={depth + 1}
          ariaPosInSet={getPosInSet(doc, id)}
          ariaSetSize={getSetSize(doc, id)}
          ariaExpanded={hasChildren ? isExpanded : undefined}
          excerpt={excerpt}
          childCount={childCount}
          searchMatch={isMatch}
          searchActive={searchActive}
          editor={editor}
          onSelect={(nodeId) => editor.select(nodeId)}
          onToggle={handleToggle}
          onEnter={(nodeId) => editor.select(nodeId)}
          onDelete={(nodeId) => {
            const n = getNode(doc, nodeId)
            if (!n || n.parentId === null) return
            if (n.childOrder.length > 0) {
              const shouldDelete = confirmDelete
                ? confirmDelete(n)
                : typeof window !== 'undefined' &&
                  window.confirm(`Delete "${nodeId}" and its subtree?`)
              if (shouldDelete) editor.deleteNode(nodeId)
            } else {
              editor.deleteNode(nodeId)
            }
          }}
          onEdit={(nodeId) => {
            editor.select(nodeId)
            editor.startEditing(nodeId)
          }}
          onFocusItem={() => {}}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      )
    })
  }, [
    visibleIds,
    doc,
    selectedId,
    state.editingNodeId,
    focusedItemId,
    dropTargetId,
    dropZone,
    searchActive,
    searchQuery,
    filteredVisibleIds,
    ephemeralExpand,
    editor,
    confirmDelete,
    handleToggle,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  ])

  return (
    <div className={`mml-outline ${className ?? ''}`}>
      {(showToolbar || searchable) && (
        <div className="mml-outline-toolbar">
          {searchable && (
            <input
              className="mml-outline-search"
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          )}
          {showToolbar && !searchActive && (
            <>
              <button
                className="mml-outline-collapse-all"
                onClick={handleCollapseAll}
              >
                Collapse all
              </button>
              <button
                className="mml-outline-expand-all"
                onClick={handleExpandAll}
              >
                Expand all
              </button>
            </>
          )}
        </div>
      )}
      <div
        className="mml-outline-tree"
        role="tree"
        aria-label="Mindmap outline"
        tabIndex={focusedItemId ? -1 : 0}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!focusedItemId && visibleIds.length > 0) {
            setFocusedItemId(selectedId ?? visibleIds[0])
          }
        }}
      >
        {items}
      </div>
    </div>
  )
}

export const OutlineView = OutlineViewComponent
