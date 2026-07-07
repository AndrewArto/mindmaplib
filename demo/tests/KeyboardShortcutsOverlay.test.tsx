import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  KeyboardShortcutsOverlay,
  getPlatformModifier,
  isEditableTarget,
} from '../src/KeyboardShortcutsOverlay'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.replaceChildren()
})

function render(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(element)
  })
  return host
}

describe('KeyboardShortcutsOverlay', () => {
  it('renders grouped shortcuts with platform-specific modifier labels', () => {
    const host = render(
      <KeyboardShortcutsOverlay modifier="Cmd" onClose={() => {}} />,
    )

    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe(
      'keyboard-shortcuts-title',
    )
    expect(dialog?.textContent).toContain('Keyboard shortcuts')
    expect(dialog?.textContent).toContain('Create and edit')
    expect(dialog?.textContent).toContain('Navigate')
    expect(dialog?.textContent).toContain('Rich text while editing')
    expect(dialog?.textContent).toContain('View and layout')
    expect(dialog?.textContent).toContain('History')
    expect(dialog?.textContent).toContain('Cmd+Z')
    expect(dialog?.textContent).toContain('Cmd+Shift+Z')
  })

  it('closes from close button and backdrop only', () => {
    const onClose = vi.fn()
    const host = render(
      <KeyboardShortcutsOverlay modifier="Ctrl" onClose={onClose} />,
    )

    const dialog = host.querySelector('[role="dialog"]') as HTMLElement
    act(() => {
      dialog.click()
    })
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = host.querySelector('.shortcuts-backdrop') as HTMLElement
    act(() => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const close = host.querySelector(
      '[aria-label="Close keyboard shortcuts"]',
    ) as HTMLButtonElement
    act(() => {
      close.click()
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('detects editable targets so global ? does not open over text editing', () => {
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const textbox = document.createElement('div')
    textbox.setAttribute('role', 'textbox')
    const button = document.createElement('button')

    expect(isEditableTarget(input)).toBe(true)
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(textbox)).toBe(true)
    const emptyEditable = document.createElement('div')
    emptyEditable.setAttribute('contenteditable', '')
    const plaintext = document.createElement('div')
    plaintext.setAttribute('contenteditable', 'plaintext-only')
    const nested = document.createElement('span')
    plaintext.appendChild(nested)
    const disabledEditable = document.createElement('div')
    disabledEditable.setAttribute('contenteditable', 'false')

    expect(isEditableTarget(button)).toBe(false)
    expect(isEditableTarget(emptyEditable)).toBe(true)
    expect(isEditableTarget(plaintext)).toBe(true)
    expect(isEditableTarget(nested)).toBe(true)
    expect(isEditableTarget(disabledEditable)).toBe(false)
  })

  it('returns false when HTMLElement is unavailable outside the browser', () => {
    const original = globalThis.HTMLElement
    try {
      Reflect.deleteProperty(globalThis, 'HTMLElement')
      expect(isEditableTarget({} as EventTarget)).toBe(false)
    } finally {
      globalThis.HTMLElement = original
    }
  })

  it('uses Cmd on macOS platforms and Ctrl elsewhere', () => {
    expect(getPlatformModifier('MacIntel')).toBe('Cmd')
    expect(getPlatformModifier('iPhone')).toBe('Cmd')
    expect(getPlatformModifier('Win32')).toBe('Ctrl')
    expect(getPlatformModifier('Linux x86_64')).toBe('Ctrl')
  })
})
