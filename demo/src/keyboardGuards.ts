export function isUndoRedoShortcut(event: KeyboardEvent): boolean {
  const isMod = event.metaKey || event.ctrlKey
  if (!isMod) return false
  const key = event.key.toLowerCase()
  return key === 'y' || key === 'z'
}

export function consumeGlobalShortcut(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}
