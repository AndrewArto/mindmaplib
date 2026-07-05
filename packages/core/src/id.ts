// Dependency-free unique ID generation for documents and nodes.
//
// Framework-agnostic: no DOM, no crypto typing assumptions. Uses
// globalThis.crypto.randomUUID when available, with a counter+random fallback
// for environments without it.

let counter = 0

function fallbackId(): string {
  counter += 1
  return (
    Date.now().toString(36) +
    '_' +
    counter.toString(36) +
    '_' +
    Math.floor(Math.random() * 0x1000000).toString(36)
  )
}

/**
 * Generate a unique string ID with an optional human-readable prefix.
 * Prefers crypto.randomUUID(); falls back to a counter-based scheme.
 */
export function createId(prefix = 'id'): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const uuid = g.crypto?.randomUUID?.()
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${fallbackId()}`
}
