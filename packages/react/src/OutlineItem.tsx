// OutlineItem: a single flat row in the outline tree.
//
// NOT recursive — rendered as a flat sibling from the visible list in OutlineView.
// Memoized: only re-renders when node reference, selection, focus, depth, or
// ARIA metadata changes. No subscription to editor — receives all data as props.

import { memo, useRef } from 'react'
import type { OutlineItemProps } from './types.js'

function itemPropsEqual(
  prev: OutlineItemProps,
  next: OutlineItemProps,
): boolean {
  return (
    prev.node === next.node &&
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    prev.isFocused === next.isFocused &&
    prev.depth === next.depth &&
    prev.ariaPosInSet === next.ariaPosInSet &&
    prev.ariaSetSize === next.ariaSetSize &&
    prev.ariaExpanded === next.ariaExpanded &&
    prev.excerpt === next.excerpt &&
    prev.childCount === next.childCount &&
    prev.searchMatch === next.searchMatch &&
    prev.searchActive === next.searchActive &&
    prev.isDropTarget === next.isDropTarget &&
    prev.dropZone === next.dropZone
  )
}

function OutlineItemComponent(props: OutlineItemProps): React.ReactElement {
  const {
    node,
    isSelected,
    isFocused,
    isDraggable,
    isDropTarget,
    dropZone,
    ariaLevel,
    ariaPosInSet,
    ariaSetSize,
    ariaExpanded,
    excerpt,
    childCount,
    searchMatch,
    searchActive,
    onSelect,
    onToggle,
    onEnter,
    onDelete,
    onEdit,
    onFocusItem,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
  } = props

  const rowRef = useRef<HTMLDivElement>(null)

  const classNames = [
    'mml-outline-item',
    isSelected ? 'mml-outline-item--selected' : '',
    isFocused ? 'mml-outline-item--focused' : '',
    isDropTarget && dropZone === 'before' ? 'mml-outline-drop--before' : '',
    isDropTarget && dropZone === 'after' ? 'mml-outline-drop--after' : '',
    isDropTarget && dropZone === 'inside' ? 'mml-outline-drop--inside' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hasChildren = childCount > 0

  return (
    <div
      ref={rowRef}
      role="treeitem"
      className={classNames}
      aria-level={ariaLevel}
      aria-posinset={ariaPosInSet}
      aria-setsize={ariaSetSize}
      aria-expanded={ariaExpanded}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      style={{ '--mml-level': ariaLevel } as React.CSSProperties}
      draggable={isDraggable && !searchActive}
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragOver={(e) => onDragOver(e, node.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, node.id)}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        switch (e.key) {
          case 'ArrowUp':
          case 'ArrowDown':
          case 'ArrowLeft':
          case 'ArrowRight':
          case 'Home':
          case 'End':
          case 'Enter':
          case ' ':
          case 'Delete':
          case 'Backspace':
          case 'F2':
          case 'Escape':
            // Keyboard handled at OutlineView level via delegation
            break
          default:
            return
        }
        e.preventDefault()
        if (e.key === 'Enter') onEnter(node.id)
        else if (e.key === ' ') onSelect(node.id)
        else if (e.key === 'F2') onEdit(node.id)
        else if (e.key === 'Delete' || e.key === 'Backspace') onDelete(node.id)
        else if (e.key === 'Escape') onFocusItem('')
      }}
    >
      <div className="mml-outline-row">
        {hasChildren && (
          <button
            className="mml-outline-toggle"
            onClick={(e) => {
              e.stopPropagation()
              if (!searchActive) onToggle(node.id)
            }}
            aria-label={ariaExpanded ? 'Collapse' : 'Expand'}
          >
            {ariaExpanded ? '\u25BC' : '\u25B6'}
          </button>
        )}
        <span
          className={`mml-outline-excerpt ${excerpt === '(empty)' ? 'mml-outline-excerpt--empty' : ''} ${searchMatch ? 'mml-outline-search-match' : ''}`}
          onDoubleClick={() => onEdit(node.id)}
        >
          {excerpt}
        </span>
        {hasChildren && childCount > 0 && (
          <span className="mml-outline-badge">{childCount}</span>
        )}
      </div>
    </div>
  )
}

export const OutlineItem = memo(OutlineItemComponent, itemPropsEqual)
