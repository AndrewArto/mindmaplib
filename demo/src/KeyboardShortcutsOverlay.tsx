import { useEffect, useMemo, useRef } from 'react'

export type PlatformModifier = 'Cmd' | 'Ctrl'

type ShortcutItem = {
  keys: string[]
  label: string
}

type ShortcutGroup = {
  title: string
  items: ShortcutItem[]
}

export function getPlatformModifier(platform?: string): PlatformModifier {
  const value =
    platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  return /mac|iphone|ipad|ipod/i.test(value) ? 'Cmd' : 'Ctrl'
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('input, textarea, select, [role="textbox"]')) return true

  const editable = target.closest<HTMLElement>('[contenteditable]')
  if (!editable) return false
  return editable.getAttribute('contenteditable')?.toLowerCase() !== 'false'
}

function shortcutGroups(modifier: PlatformModifier): ShortcutGroup[] {
  return [
    {
      title: 'Create and edit',
      items: [
        { keys: ['Tab'], label: 'Add child to selected node' },
        { keys: ['Enter'], label: 'Add sibling after selected node' },
        { keys: ['Shift+Tab'], label: 'Promote selected node' },
        { keys: ['Space', 'F2'], label: 'Edit selected node' },
        { keys: ['Escape'], label: 'Stop editing or close current mode' },
        {
          keys: ['Delete', 'Backspace'],
          label: 'Delete selected node, except root',
        },
        { keys: ['Double-click'], label: 'Edit node' },
      ],
    },
    {
      title: 'Navigate',
      items: [
        { keys: ['Arrow keys'], label: 'Move selection through the tree' },
        { keys: ['Click node'], label: 'Select node' },
        { keys: ['Click outline item'], label: 'Select node from outline' },
      ],
    },
    {
      title: 'Rich text while editing',
      items: [
        { keys: [`${modifier}+B`], label: 'Bold' },
        { keys: [`${modifier}+I`], label: 'Italic' },
        { keys: ['Escape'], label: 'Save edits and exit editing' },
      ],
    },
    {
      title: 'View and layout',
      items: [
        { keys: ['Mouse drag'], label: 'Pan canvas' },
        { keys: ['Mouse wheel'], label: 'Zoom canvas' },
        { keys: [`${modifier}++`, `${modifier}+-`], label: 'Zoom in or out' },
        { keys: [`${modifier}+0`], label: 'Fit map to screen' },
        {
          keys: ['Toolbar layout buttons'],
          label: 'Switch Tree Horizontal, Tree Vertical, or Radial',
        },
        { keys: ['Outline button'], label: 'Show or hide outline' },
      ],
    },
    {
      title: 'History',
      items: [
        { keys: [`${modifier}+Z`], label: 'Undo' },
        { keys: [`${modifier}+Shift+Z`], label: 'Redo' },
      ],
    },
  ]
}

export function KeyboardShortcutsOverlay({
  modifier = getPlatformModifier(),
  onClose,
}: {
  modifier?: PlatformModifier
  onClose: () => void
}): React.ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null)
  const groups = useMemo(() => shortcutGroups(modifier), [modifier])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="shortcuts-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => !element.hasAttribute('disabled'))
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <header className="shortcuts-header">
          <div>
            <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
            <p>
              These shortcuts apply when the mindmap canvas is focused. Rich
              text shortcuts apply while editing a node.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="shortcuts-close"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="shortcuts-content">
          {groups.map((group) => (
            <section className="shortcuts-group" key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div
                    className="shortcut-row"
                    key={`${group.title}-${item.label}`}
                  >
                    <dt>
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dt>
                    <dd>{item.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <footer className="shortcuts-footer">Press Esc to close</footer>
      </section>
    </div>
  )
}
