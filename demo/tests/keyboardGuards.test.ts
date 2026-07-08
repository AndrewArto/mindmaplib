import { describe, expect, it } from 'vitest'
import { isUndoRedoShortcut } from '../src/keyboardGuards'

describe('keyboard guards', () => {
  it('identifies global undo and redo shortcuts that must be blocked by modals', () => {
    expect(
      isUndoRedoShortcut(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true }),
      ),
    ).toBe(true)
    expect(
      isUndoRedoShortcut(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true)
    expect(
      isUndoRedoShortcut(
        new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }),
      ),
    ).toBe(true)
    expect(isUndoRedoShortcut(new KeyboardEvent('keydown', { key: 'z' }))).toBe(
      false,
    )
    expect(
      isUndoRedoShortcut(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true }),
      ),
    ).toBe(false)
  })
})
