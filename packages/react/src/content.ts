// Content utilities: text extraction and TipTap JSON conversion.
//
// textExcerpt produces a plain-text summary for outline rows and ARIA labels.
// fullPlainText produces the full untruncated text for search matching.
// toTipTapJSON / fromTipTapJSON convert between NodeContent and TipTap's
// editor JSON format for the editing lifecycle.

import type {
  NodeContent,
  NodeContentBlock,
  NodeContentInline,
  TextBlock,
  ListBlock,
} from '@mindmaplib/core'

/**
 * Extract plain text from a single inline node, stripping marks.
 */
function inlineText(inline: NodeContentInline): string {
  return inline.text || ''
}

/**
 * Extract text from a block, recursing into list items.
 */
function blockText(block: NodeContentBlock): string {
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    const list = block as ListBlock
    return list.content
      .map((item) =>
        item.content
          .map((sub) => {
            if (
              sub.type === 'paragraph' ||
              sub.type === 'heading' ||
              sub.type === 'codeBlock'
            ) {
              return (sub as TextBlock).content?.map(inlineText).join('') || ''
            }
            return ''
          })
          .join(' '),
      )
      .join(' ')
  }
  const textBlock = block as TextBlock
  return textBlock.content?.map(inlineText).join('') || ''
}

/**
 * Truncate text to maxLength chars with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '\u2026'
}

/**
 * Plain-text excerpt for display: first text node, max 80 chars.
 * Returns '(empty)' if no text content found.
 */
export function textExcerpt(content: NodeContent, maxLength = 80): string {
  for (const block of content.content) {
    const text = blockText(block)
    if (text.length > 0) {
      return truncate(text, maxLength)
    }
  }
  return '(empty)'
}

/**
 * Full plain-text extraction for search matching: ALL blocks, ALL text.
 * No truncation, no maxLength.
 */
export function fullPlainText(content: NodeContent): string {
  return content.content.map(blockText).join(' ').trim()
}

/**
 * Convert NodeContent to TipTap editor JSON format.
 * NodeContent IS already TipTap-compatible JSON, so this is identity.
 * Provided for explicit conversion point in the editing lifecycle.
 */
export function toTipTapJSON(content: NodeContent): Record<string, unknown> {
  return JSON.parse(JSON.stringify(content)) as Record<string, unknown>
}

/**
 * Convert TipTap editor JSON back to NodeContent.
 * Normalizes the JSON through core's normalizeContent on the caller side.
 * Here we just cast; the editor's updateContent calls normalizeContent.
 */
export function fromTipTapJSON(json: Record<string, unknown>): NodeContent {
  return JSON.parse(JSON.stringify(json)) as NodeContent
}
