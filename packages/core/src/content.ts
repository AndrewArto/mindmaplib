// Node content helpers: empty content construction and normalization.
//
// normalizeContent enforces the Node Content Limits from MML-B-0001:
// allowed node/mark types, allowed attrs, max list nesting depth (4), and max
// text length per node (10,000 chars). It is called by updateContent
// transactions and deserialize.

import type {
  NodeContent,
  NodeContentBlock,
  NodeContentInline,
  ListBlock,
  TextBlock,
} from './types.js'

/** Maximum list nesting depth (levels of bulletList/orderedList). */
export const MAX_LIST_DEPTH = 4

/** Maximum normalized text length per node. */
export const MAX_TEXT_LENGTH = 10_000

const ALLOWED_TEXT_BLOCK_TYPES = new Set(['paragraph', 'heading', 'codeBlock'])

const ALLOWED_MARK_TYPES = new Set(['bold', 'italic', 'code', 'link'])

const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:']

/** A freshly created node has this content. */
export function emptyContent(): NodeContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
}

function isTextBlock(block: NodeContentBlock): block is TextBlock {
  return (
    block.type === 'paragraph' ||
    block.type === 'heading' ||
    block.type === 'codeBlock'
  )
}

// Exposed for tests.
export { isTextBlock }

function isListBlock(block: NodeContentBlock): block is ListBlock {
  return block.type === 'bulletList' || block.type === 'orderedList'
}

function normalizeTextBlockAttrs(
  type: TextBlock['type'],
  rawAttrs: unknown,
): Record<string, unknown> | undefined {
  if (type === 'heading') {
    const level = (rawAttrs as { level?: unknown } | undefined)?.level
    if (level === 1 || level === 2 || level === 3) return { level }
    return undefined
  }
  if (type === 'codeBlock') {
    const language = (rawAttrs as { language?: unknown } | undefined)?.language
    return typeof language === 'string' ? { language } : undefined
  }
  // paragraph: no attrs allowed
  return undefined
}

/**
 * Validate that `href` uses an allowed URL scheme (http:, https:, mailto:).
 * Manual check — core has no DOM lib and therefore no `URL` constructor.
 */
function isAllowedUrl(href: string): boolean {
  const match = /^\s*([a-z][a-z0-9+.-]*):/i.exec(href)
  if (!match) return false
  return ALLOWED_URL_SCHEMES.includes(match[1].toLowerCase() + ':')
}

function normalizeInline(
  inline: unknown,
  remaining: { chars: number },
): NodeContentInline | null {
  if (typeof inline !== 'object' || inline === null) return null
  const obj = inline as {
    type?: unknown
    text?: unknown
    marks?: unknown
  }
  if (obj.type !== 'text' || typeof obj.text !== 'string') return null

  let text = obj.text
  if (remaining.chars <= 0) return null
  if (text.length > remaining.chars) {
    text = text.slice(0, remaining.chars)
  }
  remaining.chars -= text.length

  const marks: NonNullable<NodeContentInline['marks']> = []
  if (Array.isArray(obj.marks)) {
    for (const mark of obj.marks) {
      if (typeof mark !== 'object' || mark === null) continue
      const m = mark as { type?: unknown; attrs?: unknown }
      if (typeof m.type !== 'string' || !ALLOWED_MARK_TYPES.has(m.type)) {
        continue
      }
      if (m.type === 'link') {
        const attrs = m.attrs as
          { href?: unknown; target?: unknown } | undefined
        const href = typeof attrs?.href === 'string' ? attrs.href : ''
        if (!isAllowedUrl(href)) continue
        const target = attrs?.target === '_blank' ? '_blank' : undefined
        marks.push({
          type: 'link',
          attrs: { href, ...(target ? { target } : {}) },
        })
      } else {
        marks.push({ type: m.type })
      }
    }
  }

  return { type: 'text', text, ...(marks.length ? { marks } : {}) }
}

function normalizeTextBlock(
  block: unknown,
  remaining: { chars: number },
): TextBlock | null {
  if (typeof block !== 'object' || block === null) return null
  const obj = block as {
    type?: unknown
    attrs?: unknown
    content?: unknown
  }
  if (typeof obj.type !== 'string' || !ALLOWED_TEXT_BLOCK_TYPES.has(obj.type)) {
    return null
  }
  const type = obj.type as TextBlock['type']
  const result: TextBlock = { type }

  const attrs = normalizeTextBlockAttrs(type, obj.attrs)
  if (attrs) result.attrs = attrs

  if (Array.isArray(obj.content)) {
    const content: NodeContentInline[] = []
    for (const item of obj.content) {
      const inline = normalizeInline(item, remaining)
      if (inline) content.push(inline)
    }
    if (content.length) result.content = content
  }
  return result
}

interface NormalizedListItem {
  type: 'listItem'
  content: Array<TextBlock | ListBlock>
}

function normalizeListBlock(
  block: unknown,
  depth: number,
  remaining: { chars: number },
): ListBlock | null {
  if (depth > MAX_LIST_DEPTH) return null
  if (typeof block !== 'object' || block === null) return null
  const obj = block as { type?: unknown; content?: unknown }
  if (obj.type !== 'bulletList' && obj.type !== 'orderedList') return null

  const items: NormalizedListItem[] = []
  if (Array.isArray(obj.content)) {
    for (const item of obj.content) {
      if (typeof item !== 'object' || item === null) continue
      const normalizedItem = normalizeListItem(item, depth, remaining)
      if (normalizedItem) items.push(normalizedItem)
    }
  }
  if (items.length === 0) return null
  return { type: obj.type, content: items }
}

function normalizeListItem(
  item: unknown,
  depth: number,
  remaining: { chars: number },
): NormalizedListItem | null {
  if (typeof item !== 'object' || item === null) return null
  const obj = item as { type?: unknown; content?: unknown }
  if (obj.type !== 'listItem' || !Array.isArray(obj.content)) return null

  const content: Array<TextBlock | ListBlock> = []
  for (const child of obj.content) {
    if (typeof child !== 'object' || child === null) continue
    const c = child as { type?: unknown }
    if (typeof c.type === 'string' && ALLOWED_TEXT_BLOCK_TYPES.has(c.type)) {
      const tb = normalizeTextBlock(child, remaining)
      if (tb) content.push(tb)
    } else if (c.type === 'bulletList' || c.type === 'orderedList') {
      const lb = normalizeListBlock(child, depth + 1, remaining)
      if (lb) content.push(lb)
    }
  }
  if (content.length === 0) return null
  return { type: 'listItem', content }
}

/**
 * Normalize a NodeContent payload: strip disallowed attrs, truncate text to
 * MAX_TEXT_LENGTH, enforce max list nesting depth, and remove unknown node
 * and mark types. Always returns a valid (possibly empty) NodeContent.
 */
export function normalizeContent(input: unknown): NodeContent {
  const remaining = { chars: MAX_TEXT_LENGTH }
  const blocks: NodeContentBlock[] = []

  if (
    typeof input === 'object' &&
    input !== null &&
    (input as { type?: unknown }).type === 'doc' &&
    Array.isArray((input as { content?: unknown }).content)
  ) {
    for (const block of (input as { content: unknown[] }).content) {
      if (typeof block !== 'object' || block === null) continue
      const b = block as { type?: unknown }
      if (typeof b.type === 'string' && ALLOWED_TEXT_BLOCK_TYPES.has(b.type)) {
        const tb = normalizeTextBlock(block, remaining)
        if (tb) blocks.push(tb)
      } else if (b.type === 'bulletList' || b.type === 'orderedList') {
        const lb = normalizeListBlock(block, 1, remaining)
        if (lb) blocks.push(lb)
      }
      // unknown block types are dropped
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', content: [] })
  }
  return { type: 'doc', content: blocks }
}

// Re-export for modules that need the type guard.
export { isListBlock }
