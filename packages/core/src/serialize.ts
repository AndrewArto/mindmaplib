// Serialization: serialize / deserialize with schemaVersion migration policy
// (MML-B-0001 § Serialization). deserialize validates, normalizes content,
// strips unknown fields, and runs validateDoc.

import type {
  MindmapDoc,
  MindmapNode,
  NodeContent,
  SerializedDoc,
} from './types.js'
import { MindmapError } from './errors.js'
import { validateDoc } from './validation.js'
import { normalizeContent } from './content.js'

/** Current document schema version. */
export const SCHEMA_VERSION = 1

/**
 * Serialize a document to a JSON string wrapping it with schemaVersion.
 */
export function serialize(doc: MindmapDoc): string {
  const wrapper: SerializedDoc = { schemaVersion: SCHEMA_VERSION, doc }
  return JSON.stringify(wrapper)
}

/** Pick only known MindmapNode fields (strips unknown/forward fields). */
function pickNode(raw: unknown): MindmapNode {
  if (typeof raw !== 'object' || raw === null) {
    throw new MindmapError(
      'deserialize: node entry is not an object',
      'MALFORMED_JSON',
    )
  }
  const n = raw as Record<string, unknown>

  // Validate required fields — reject instead of coercing fabrications.
  if (typeof n.id !== 'string' || n.id.length === 0) {
    throw new MindmapError(
      'deserialize: node id is missing or not a non-empty string',
      'MALFORMED_JSON',
    )
  }
  if (n.parentId !== null && typeof n.parentId !== 'string') {
    throw new MindmapError(
      `deserialize: node '${n.id}' parentId is not a string or null`,
      'MALFORMED_JSON',
    )
  }

  const position =
    n.position && typeof n.position === 'object'
      ? ({
          x: Number((n.position as { x?: unknown }).x),
          y: Number((n.position as { y?: unknown }).y),
        } as MindmapNode['position'])
      : null
  return {
    id: n.id,
    parentId: n.parentId as string | null,
    position,
    manualPosition: Boolean(n.manualPosition),
    content: normalizeContent(n.content as NodeContent | undefined),
    collapsed: Boolean(n.collapsed),
    childOrder: Array.isArray(n.childOrder) ? n.childOrder.map(String) : [],
  }
}

/**
 * Parse and validate a serialized document. Throws MindmapError on malformed
 * JSON, unknown schemaVersion, missing doc, or invariant violations. Unknown
 * fields are stripped (forward-compatible).
 */
export function deserialize(json: string): MindmapDoc {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new MindmapError('deserialize: malformed JSON', 'MALFORMED_JSON')
  }

  const wrapper = parsed as Partial<SerializedDoc>
  if (
    typeof wrapper !== 'object' ||
    wrapper === null ||
    typeof wrapper.schemaVersion !== 'number'
  ) {
    throw new MindmapError(
      'deserialize: missing or invalid schemaVersion',
      'SCHEMA_MISMATCH',
    )
  }
  if (wrapper.schemaVersion !== SCHEMA_VERSION) {
    throw new MindmapError(
      `deserialize: unsupported schemaVersion ${wrapper.schemaVersion} (current ${SCHEMA_VERSION})`,
      'SCHEMA_MISMATCH',
    )
  }

  const rawDoc = (wrapper as { doc?: unknown }).doc
  if (typeof rawDoc !== 'object' || rawDoc === null) {
    throw new MindmapError('deserialize: missing doc', 'MALFORMED_JSON')
  }
  const d = rawDoc as Record<string, unknown>

  const rawNodes = d.nodes
  const nodes: Record<string, MindmapNode> = Object.create(null)
  if (rawNodes && typeof rawNodes === 'object') {
    for (const [id, raw] of Object.entries(
      rawNodes as Record<string, unknown>,
    )) {
      nodes[id] = pickNode(raw)
    }
  }

  const meta = (d.meta ?? {}) as Record<string, unknown>
  const rawVersion = Number(d.version ?? 0)
  if (
    !Number.isFinite(rawVersion) ||
    rawVersion < 0 ||
    !Number.isInteger(rawVersion)
  ) {
    throw new MindmapError(
      `deserialize: invalid document version ${JSON.stringify(d.version)}`,
      'MALFORMED_JSON',
    )
  }

  const result: MindmapDoc = {
    id: String(d.id ?? ''),
    rootId: String(d.rootId ?? ''),
    nodes,
    version: rawVersion,
    meta: {
      title: String(meta.title ?? ''),
      created: String(meta.created ?? ''),
      updated: String(meta.updated ?? ''),
    },
  }

  validateDoc(result)
  return result
}
