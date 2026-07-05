// NodeContent <-> plain text helpers.
// Demo uses plain-text labels; core stores rich text. These bridge the gap.

import type { NodeContent, NodeContentInline } from '@mindmaplib/core'
import { emptyContent } from '@mindmaplib/core'

/** Extract plain text from a NodeContent (first paragraph). */
export function contentToText(content: NodeContent): string {
  for (const block of content.content) {
    if (block.type === 'paragraph' && block.content) {
      return extractText(block.content)
    }
    if (block.type === 'heading' && block.content) {
      return extractText(block.content)
    }
  }
  return ''
}

function extractText(inlines: NodeContentInline[]): string {
  return inlines
    .filter((i): i is { type: 'text'; text: string } => i.type === 'text')
    .map((i) => i.text)
    .join('')
}

/** Build a NodeContent from a plain-text string. */
export function textToContent(text: string): NodeContent {
  const content = emptyContent()
  if (text.length > 0) {
    content.content = [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  }
  return content
}
